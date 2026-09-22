use std::{
  fs::{self, File},
  io::copy,
  path::{Path, PathBuf},
  process::{Child, Command, Stdio},
  sync::{Mutex, OnceLock},
  thread,
  time::{Duration, Instant}
};
use tauri::{AppHandle, Manager};
use zip::ZipArchive;

const SCRCPY_VERSION: &str = "4.1";

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
use windows_sys::Win32::{
  Foundation::HWND,
  UI::WindowsAndMessaging::{
    FindWindowW, GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, ShowWindow,
    GWL_STYLE, GWLP_HWNDPARENT, HWND_TOP, SWP_FRAMECHANGED, SWP_SHOWWINDOW, SW_SHOW,
    WS_CAPTION, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_POPUP, WS_SYSMENU, WS_THICKFRAME, WS_VISIBLE
  }
};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Copy, Default)]
struct MirrorRect {
  x: i32,
  y: i32,
  width: i32,
  height: i32
}

#[derive(Default)]
struct MirrorState {
  child: Option<Child>,
  hwnd: isize,
  serial: String,
  rect: Option<MirrorRect>
}

static MIRROR_STATE: OnceLock<Mutex<MirrorState>> = OnceLock::new();

fn state() -> &'static Mutex<MirrorState> {
  MIRROR_STATE.get_or_init(|| Mutex::new(MirrorState::default()))
}

fn extract_scrcpy(archive_path: &Path, destination: &Path) -> Result<(), String> {
  fs::create_dir_all(destination).map_err(|e| e.to_string())?;
  let file = File::open(archive_path).map_err(|e| e.to_string())?;
  let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

  for index in 0..archive.len() {
    let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
    let Some(path) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
      continue;
    };

    let output = destination.join(path);
    if entry.is_dir() {
      fs::create_dir_all(&output).map_err(|e| e.to_string())?;
      continue;
    }

    if let Some(parent) = output.parent() {
      fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut target = File::create(&output).map_err(|e| e.to_string())?;
    copy(&mut entry, &mut target).map_err(|e| e.to_string())?;
  }

  Ok(())
}

fn scrcpy_exe(app: &AppHandle) -> Result<PathBuf, String> {
  if let Ok(custom) = std::env::var("HTRANS_SCRCPY") {
    let path = PathBuf::from(custom);
    if path.exists() {
      return Ok(path);
    }
  }

  let runtime = app
    .path()
    .app_local_data_dir()
    .map_err(|e| e.to_string())?
    .join("scrcpy-runtime")
    .join(SCRCPY_VERSION);

  let candidates = [
    runtime.join("scrcpy.exe"),
    runtime
      .join(format!("scrcpy-win64-v{SCRCPY_VERSION}"))
      .join("scrcpy.exe")
  ];

  for candidate in &candidates {
    if candidate.exists() {
      return Ok(candidate.clone());
    }
  }

  let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
  let archive = [
    resources.join(format!("scrcpy-win64-v{SCRCPY_VERSION}.zip")),
    resources
      .join("resources")
      .join(format!("scrcpy-win64-v{SCRCPY_VERSION}.zip"))
  ]
  .into_iter()
  .find(|path| path.exists())
  .ok_or_else(|| "ملفات البث المباشر غير موجودة في H TRANS.".to_string())?;

  extract_scrcpy(&archive, &runtime)?;

  for candidate in &candidates {
    if candidate.exists() {
      return Ok(candidate.clone());
    }
  }

  Err("تعذر تجهيز محرك البث المباشر.".into())
}

#[cfg(target_os = "windows")]
fn wide(value: &str) -> Vec<u16> {
  value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn screen_rect(app: &AppHandle, rect: MirrorRect) -> Result<(HWND, i32, i32, i32, i32), String> {
  let window = app
    .get_webview_window("main")
    .ok_or_else(|| "تعذر العثور على نافذة H TRANS.".to_string())?;
  let raw = window.hwnd().map_err(|e| e.to_string())?;
  let parent = raw.0 as HWND;
  let inner = window.inner_position().map_err(|e| e.to_string())?;

  Ok((
    parent,
    inner.x.saturating_add(rect.x),
    inner.y.saturating_add(rect.y),
    rect.width.max(1),
    rect.height.max(1)
  ))
}

#[cfg(target_os = "windows")]
fn place_overlay(app: &AppHandle, child_hwnd: isize, rect: MirrorRect) -> Result<(), String> {
  let (parent, x, y, width, height) = screen_rect(app, rect)?;
  let child = child_hwnd as HWND;

  unsafe {
    // Keep scrcpy as a real top-level SDL window. Re-parenting SDL into WebView2
    // can render a permanently black surface on Windows.
    let style = GetWindowLongPtrW(child, GWL_STYLE);
    let remove = (WS_CAPTION
      | WS_THICKFRAME
      | WS_SYSMENU
      | WS_MINIMIZEBOX
      | WS_MAXIMIZEBOX) as isize;
    let add = (WS_POPUP | WS_VISIBLE) as isize;

    SetWindowLongPtrW(child, GWL_STYLE, (style & !remove) | add);
    SetWindowLongPtrW(child, GWLP_HWNDPARENT, parent as isize);

    SetWindowPos(
      child,
      HWND_TOP,
      x,
      y,
      width,
      height,
      SWP_SHOWWINDOW | SWP_FRAMECHANGED
    );
    ShowWindow(child, SW_SHOW);
  }

  Ok(())
}

pub fn stop() {
  if let Ok(mut guard) = state().lock() {
    if let Some(mut child) = guard.child.take() {
      let _ = child.kill();
      let _ = child.wait();
    }
    guard.hwnd = 0;
    guard.serial.clear();
    guard.rect = None;
  }
}

#[cfg(target_os = "windows")]
pub fn start(
  app: &AppHandle,
  serial: &str,
  x: i32,
  y: i32,
  width: i32,
  height: i32
) -> Result<(), String> {
  stop();

  let rect = MirrorRect { x, y, width, height };
  let exe = scrcpy_exe(app)?;
  let dir = exe
    .parent()
    .ok_or_else(|| "مسار scrcpy غير صالح.".to_string())?;
  let title = format!("HTRANS_MIRROR_{}", serial.replace(':', "_"));

  let mut command = Command::new(&exe);
  command
    .current_dir(dir)
    .args([
      "--serial",
      serial,
      "--no-audio",
      "--no-control",
      "--window-borderless",
      "--no-terminal-title",
      "--video-codec=h264",
      "--max-size=1080",
      "--max-fps=30",
      "--video-bit-rate=6M",
      "--render-fit=letterbox",
      "--background-color=07131f",
      "--window-title",
      &title
    ])
    .env("ADB", crate::android::adb_path(app))
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .creation_flags(CREATE_NO_WINDOW);

  let child = command.spawn().map_err(|e| format!("تعذر تشغيل البث: {e}"))?;
  let title_wide = wide(&title);
  let started = Instant::now();
  let mut found = 0isize;

  while started.elapsed() < Duration::from_secs(10) {
    let hwnd = unsafe { FindWindowW(std::ptr::null(), title_wide.as_ptr()) };
    if !hwnd.is_null() {
      found = hwnd as isize;
      break;
    }
    thread::sleep(Duration::from_millis(100));
  }

  if found == 0 {
    let mut child = child;
    let _ = child.kill();
    let _ = child.wait();
    return Err("تعذر فتح نافذة البث المباشر للهاتف.".into());
  }

  place_overlay(app, found, rect)?;

  let mut guard = state().lock().map_err(|_| "تعذر قفل حالة البث.".to_string())?;
  guard.child = Some(child);
  guard.hwnd = found;
  guard.serial = serial.to_string();
  guard.rect = Some(rect);
  Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn start(
  _app: &AppHandle,
  _serial: &str,
  _x: i32,
  _y: i32,
  _width: i32,
  _height: i32
) -> Result<(), String> {
  Err("البث المباشر مدعوم حاليًا على Windows فقط.".into())
}

#[cfg(target_os = "windows")]
pub fn resize(
  app: &AppHandle,
  x: i32,
  y: i32,
  width: i32,
  height: i32
) -> Result<(), String> {
  let rect = MirrorRect { x, y, width, height };
  let hwnd = {
    let mut guard = state().lock().map_err(|_| "تعذر قفل حالة البث.".to_string())?;
    guard.rect = Some(rect);
    guard.hwnd
  };

  if hwnd == 0 {
    return Ok(());
  }

  place_overlay(app, hwnd, rect)
}

#[cfg(not(target_os = "windows"))]
pub fn resize(
  _app: &AppHandle,
  _x: i32,
  _y: i32,
  _width: i32,
  _height: i32
) -> Result<(), String> {
  Ok(())
}
