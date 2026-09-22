use serde::Serialize;
use std::{
  ffi::OsStr,
  fs::{self, File},
  io::copy,
  path::PathBuf,
  process::{Command, Output},
  sync::{Mutex, OnceLock},
  thread,
  time::{Duration, Instant}
};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tauri::{AppHandle, Manager};
use thiserror::Error;
use zip::ZipArchive;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn hidden_command<S: AsRef<OsStr>>(program: S) -> Command {
  let mut command = Command::new(program);
  #[cfg(target_os = "windows")]
  {
    command.creation_flags(CREATE_NO_WINDOW);
  }
  command
}

#[derive(Debug, Error)]
pub enum AndroidError {
  #[error("ADB is not available. Use an official H TRANS build or set HTRANS_ADB to adb.exe.")]
  AdbUnavailable,
  #[error("ADB command failed: {0}")]
  CommandFailed(String)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidDevice {
  pub serial: String,
  pub state: String,
  pub manufacturer: String,
  pub model: String,
  pub android_version: String,
  pub battery_level: Option<u8>,
  pub storage_summary: Option<String>,
  pub whatsapp_installed: bool,
  pub whatsapp_business_installed: bool
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidDiagnostic {
  pub code: String,
  pub adb_available: bool,
  pub adb_server_running: bool,
  pub adb_device_seen: bool,
  pub adb_interface_seen: bool,
  pub adb_path: String,
  pub windows_usb_seen: bool,
  pub windows_device_name: Option<String>,
  pub windows_device_status: Option<String>,
  pub raw_adb: Option<String>
}

#[derive(Debug, Clone)]
struct WindowsPhoneProbe {
  usb_seen: bool,
  device_name: Option<String>,
  device_status: Option<String>,
  adb_interface_seen: bool
}

fn prepare_bundled_adb(app: &AppHandle) -> Option<PathBuf> {
  let base = app
    .path()
    .app_local_data_dir()
    .ok()?
    .join("adb-runtime")
    .join(env!("CARGO_PKG_VERSION"))
    .join("platform-tools");

  let adb_exe = base.join("adb.exe");
  let api_dll = base.join("AdbWinApi.dll");
  let usb_dll = base.join("AdbWinUsbApi.dll");

  if adb_exe.exists() && api_dll.exists() && usb_dll.exists() {
    return Some(adb_exe);
  }

  let resource_dir = app.path().resource_dir().ok()?;
  let archive_path = [
    resource_dir.join("android-platform-tools.zip"),
    resource_dir.join("resources").join("android-platform-tools.zip")
  ]
  .into_iter()
  .find(|path| path.exists())?;

  fs::create_dir_all(&base).ok()?;

  let file = File::open(archive_path).ok()?;
  let mut archive = ZipArchive::new(file).ok()?;

  for name in ["adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll"] {
    let entry_name = format!("platform-tools/{name}");
    let mut entry = archive.by_name(&entry_name).ok()?;
    let target = base.join(name);
    let mut output = File::create(target).ok()?;
    copy(&mut entry, &mut output).ok()?;
  }

  if adb_exe.exists() && api_dll.exists() && usb_dll.exists() {
    Some(adb_exe)
  } else {
    None
  }
}

pub fn adb_path(app: &AppHandle) -> PathBuf {
  if let Ok(custom) = std::env::var("HTRANS_ADB") {
    return PathBuf::from(custom);
  }

  if let Some(bundled) = prepare_bundled_adb(app) {
    return bundled;
  }

  // Compatibility fallback for H TRANS 0.4.0 and older installs.
  if let Ok(resource_dir) = app.path().resource_dir() {
    for candidate in [
      resource_dir.join("platform-tools").join("adb.exe"),
      resource_dir.join("resources").join("platform-tools").join("adb.exe")
    ] {
      if candidate.exists() {
        return candidate;
      }
    }
  }

  PathBuf::from("adb")
}

fn raw_adb(app: &AppHandle, args: &[&str]) -> Result<Output, AndroidError> {
  hidden_command(adb_path(app))
    .args(args)
    .output()
    .map_err(|_| AndroidError::AdbUnavailable)
}

pub fn adb(app: &AppHandle, args: &[&str]) -> Result<Output, AndroidError> {
  let output = raw_adb(app, args)?;

  if output.status.success() {
    Ok(output)
  } else {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(AndroidError::CommandFailed(if stderr.is_empty() { stdout } else { stderr }))
  }
}

pub fn start_adb_server(app: &AppHandle) -> Result<(), AndroidError> {
  let version = raw_adb(app, &["version"])?;
  if !version.status.success() {
    return Err(AndroidError::CommandFailed(
      String::from_utf8_lossy(&version.stderr).trim().to_string()
    ));
  }

  let started = raw_adb(app, &["start-server"])?;
  if started.status.success() {
    Ok(())
  } else {
    Err(AndroidError::CommandFailed(
      String::from_utf8_lossy(&started.stderr).trim().to_string()
    ))
  }
}

pub fn stop_adb_server(app: &AppHandle) {
  let _ = raw_adb(app, &["kill-server"]);
}

pub fn pair_wireless(app: &AppHandle, endpoint: &str, code: &str) -> Result<String, AndroidError> {
  if endpoint.trim().is_empty() || code.trim().is_empty() {
    return Err(AndroidError::CommandFailed("Pairing endpoint and code are required.".into()));
  }

  let output = raw_adb(app, &["pair", endpoint.trim(), code.trim()])?;
  let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

  if output.status.success() && stdout.to_ascii_lowercase().contains("success") {
    Ok(stdout)
  } else {
    Err(AndroidError::CommandFailed(if stderr.is_empty() { stdout } else { stderr }))
  }
}

pub fn connect_wireless(app: &AppHandle, endpoint: &str) -> Result<String, AndroidError> {
  if endpoint.trim().is_empty() {
    return Err(AndroidError::CommandFailed("Wireless endpoint is required.".into()));
  }

  let output = raw_adb(app, &["connect", endpoint.trim()])?;
  let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

  if output.status.success() && !stdout.to_ascii_lowercase().contains("failed") {
    Ok(stdout)
  } else {
    Err(AndroidError::CommandFailed(if stderr.is_empty() { stdout } else { stderr }))
  }
}

fn text(app: &AppHandle, serial: &str, args: &[&str]) -> Result<String, AndroidError> {
  let mut all = vec!["-s", serial];
  all.extend_from_slice(args);
  Ok(String::from_utf8_lossy(&adb(app, &all)?.stdout).trim().to_string())
}

fn parse_devices(stdout: &str) -> Vec<(String, String)> {
  stdout
    .lines()
    .skip(1)
    .filter_map(|line| {
      let trimmed = line.trim();
      if trimmed.is_empty() {
        return None;
      }

      let mut parts = trimmed.split_whitespace();
      let serial = parts.next()?.to_string();
      let state = parts.next()?.to_string();
      Some((serial, state))
    })
    .collect()
}

#[cfg(target_os = "windows")]
static WINDOWS_PROBE_CACHE: OnceLock<Mutex<Option<(Instant, WindowsPhoneProbe)>>> = OnceLock::new();

#[cfg(target_os = "windows")]
fn windows_phone_probe_uncached() -> WindowsPhoneProbe {
  let script = r#"
$patterns = 'Android|ADB|MTP|Samsung|Galaxy|Pixel|Xiaomi|Redmi|POCO|OnePlus|OPPO|vivo|HONOR|HUAWEI|Motorola|realme|Nothing'
$items = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
  Where-Object {
    $_.FriendlyName -and
    ($_.FriendlyName -match $patterns -or $_.Class -eq 'AndroidUsbDeviceClass' -or $_.Class -eq 'WPD')
  }

foreach ($item in $items) {
  $name = [string]$item.FriendlyName
  $class = [string]$item.Class
  $status = [string]$item.Status
  Write-Output ($name + '|' + $class + '|' + $status)
}
"#;

  let output = hidden_command("powershell")
    .args(["-NoProfile", "-NonInteractive", "-Command", script])
    .output();

  let Ok(output) = output else {
    return WindowsPhoneProbe {
      usb_seen: false,
      device_name: None,
      device_status: None,
      adb_interface_seen: false
    };
  };

  let stdout = String::from_utf8_lossy(&output.stdout);
  let mut usb_seen = false;
  let mut device_name: Option<String> = None;
  let mut device_status: Option<String> = None;
  let mut adb_interface_seen = false;

  for line in stdout.lines() {
    let parts: Vec<&str> = line.split('|').collect();
    if parts.is_empty() {
      continue;
    }

    let name = parts.get(0).copied().unwrap_or("").trim();
    let class = parts.get(1).copied().unwrap_or("").trim();
    let status = parts.get(2).copied().unwrap_or("").trim();

    if name.is_empty() {
      continue;
    }

    usb_seen = true;

    let lower_name = name.to_ascii_lowercase();
    let lower_class = class.to_ascii_lowercase();
    if lower_name.contains("adb") || lower_class.contains("androidusbdeviceclass") {
      adb_interface_seen = true;
    }

    let is_generic = lower_name.contains("adb")
      || lower_name.contains("mtp")
      || lower_name.contains("android composite")
      || lower_name.contains("android device");

    if device_name.is_none() || !is_generic {
      device_name = Some(name.to_string());
      device_status = if status.is_empty() { None } else { Some(status.to_string()) };
    }
  }

  WindowsPhoneProbe {
    usb_seen,
    device_name,
    device_status,
    adb_interface_seen
  }
}

#[cfg(target_os = "windows")]
fn windows_phone_probe() -> WindowsPhoneProbe {
  let cache = WINDOWS_PROBE_CACHE.get_or_init(|| Mutex::new(None));

  if let Ok(guard) = cache.lock() {
    if let Some((captured, probe)) = guard.as_ref() {
      if captured.elapsed() < Duration::from_secs(10) {
        return probe.clone();
      }
    }
  }

  let probe = windows_phone_probe_uncached();

  if let Ok(mut guard) = cache.lock() {
    *guard = Some((Instant::now(), probe.clone()));
  }

  probe
}

#[cfg(target_os = "windows")]
fn clear_windows_probe_cache() {
  if let Some(cache) = WINDOWS_PROBE_CACHE.get() {
    if let Ok(mut guard) = cache.lock() {
      *guard = None;
    }
  }
}

#[cfg(not(target_os = "windows"))]
fn windows_phone_probe() -> WindowsPhoneProbe {
  WindowsPhoneProbe {
    usb_seen: false,
    device_name: None,
    device_status: None,
    adb_interface_seen: false
  }
}

#[cfg(not(target_os = "windows"))]
fn clear_windows_probe_cache() {}

fn diagnostic(
  code: &str,
  adb_available: bool,
  adb_server_running: bool,
  adb_device_seen: bool,
  adb_path_text: String,
  probe: WindowsPhoneProbe,
  raw_adb: Option<String>
) -> AndroidDiagnostic {
  AndroidDiagnostic {
    code: code.into(),
    adb_available,
    adb_server_running,
    adb_device_seen,
    adb_interface_seen: probe.adb_interface_seen,
    adb_path: adb_path_text,
    windows_usb_seen: probe.usb_seen,
    windows_device_name: probe.device_name,
    windows_device_status: probe.device_status,
    raw_adb
  }
}

pub fn diagnose_connection(app: &AppHandle) -> AndroidDiagnostic {
  let path = adb_path(app);
  let adb_path_text = path.display().to_string();

  let version = hidden_command(&path).arg("version").output();
  let Ok(version) = version else {
    return diagnostic(
      "adb_unavailable",
      false,
      false,
      false,
      adb_path_text,
      windows_phone_probe(),
      None
    );
  };

  if !version.status.success() {
    return diagnostic(
      "adb_unavailable",
      false,
      false,
      false,
      adb_path_text,
      windows_phone_probe(),
      Some(String::from_utf8_lossy(&version.stderr).trim().to_string())
    );
  }

  let server = hidden_command(&path).arg("start-server").output();
  let server_running = server.as_ref().map(|out| out.status.success()).unwrap_or(false);

  if !server_running {
    let raw = server
      .ok()
      .map(|out| String::from_utf8_lossy(&out.stderr).trim().to_string());

    return diagnostic(
      "adb_start_failed",
      true,
      false,
      false,
      adb_path_text,
      windows_phone_probe(),
      raw
    );
  }

  let devices = hidden_command(&path).args(["devices", "-l"]).output();
  let Ok(devices) = devices else {
    return diagnostic(
      "adb_error",
      true,
      true,
      false,
      adb_path_text,
      windows_phone_probe(),
      None
    );
  };

  let stdout = String::from_utf8_lossy(&devices.stdout).to_string();
  let parsed = parse_devices(&stdout);

  // If ADB already sees the phone, do not run the expensive PowerShell PnP scan.
  let adb_probe = WindowsPhoneProbe {
    usb_seen: true,
    device_name: None,
    device_status: None,
    adb_interface_seen: true
  };

  if parsed.iter().any(|(_, state)| state == "device") {
    return diagnostic(
      "connected",
      true,
      true,
      true,
      adb_path_text,
      adb_probe,
      Some(stdout)
    );
  }

  if parsed.iter().any(|(_, state)| state == "unauthorized") {
    return diagnostic(
      "unauthorized",
      true,
      true,
      true,
      adb_path_text,
      adb_probe,
      Some(stdout)
    );
  }

  if parsed.iter().any(|(_, state)| state == "offline") {
    return diagnostic(
      "offline",
      true,
      true,
      true,
      adb_path_text,
      adb_probe,
      Some(stdout)
    );
  }

  let probe = windows_phone_probe();
  diagnostic(
    if probe.usb_seen { "usb_seen_no_adb" } else { "no_usb_device" },
    true,
    true,
    false,
    adb_path_text,
    probe,
    Some(stdout)
  )
}

pub fn repair_connection(app: &AppHandle) -> AndroidDiagnostic {
  let path = adb_path(app);
  clear_windows_probe_cache();

  let _ = hidden_command(&path).arg("kill-server").output();
  thread::sleep(Duration::from_millis(300));

  let _ = hidden_command(&path).arg("start-server").output();
  thread::sleep(Duration::from_millis(450));

  let _ = hidden_command(&path).arg("reconnect").output();
  thread::sleep(Duration::from_millis(250));

  diagnose_connection(app)
}

pub fn detect_device(app: &AppHandle) -> Result<Option<AndroidDevice>, AndroidError> {
  let _ = start_adb_server(app);

  let output = adb(app, &["devices", "-l"])?;
  let stdout = String::from_utf8_lossy(&output.stdout);

  let mut selected: Option<(String, String)> = None;
  for (serial, state) in parse_devices(&stdout) {
    selected = Some((serial, state.clone()));
    if state == "device" {
      break;
    }
  }

  if let Some((serial, raw_state)) = selected {
    if raw_state != "device" {
      let state = if raw_state == "unauthorized" {
        "unauthorized"
      } else {
        "offline"
      };

      return Ok(Some(AndroidDevice {
        serial,
        state: state.to_string(),
        manufacturer: String::new(),
        model: String::new(),
        android_version: String::new(),
        battery_level: None,
        storage_summary: None,
        whatsapp_installed: false,
        whatsapp_business_installed: false
      }));
    }

    let manufacturer =
      text(app, &serial, &["shell", "getprop", "ro.product.manufacturer"]).unwrap_or_default();
    let model = text(app, &serial, &["shell", "getprop", "ro.product.model"]).unwrap_or_default();
    let android_version =
      text(app, &serial, &["shell", "getprop", "ro.build.version.release"]).unwrap_or_default();

    let battery_dump = text(app, &serial, &["shell", "dumpsys", "battery"]).unwrap_or_default();
    let battery_level = battery_dump
      .lines()
      .find_map(|line| line.trim().strip_prefix("level:"))
      .and_then(|value| value.trim().parse::<u8>().ok());

    let storage = text(app, &serial, &["shell", "df", "-h", "/sdcard"]).unwrap_or_default();
    let storage_summary = storage.lines().last().map(|line| {
      let columns: Vec<&str> = line.split_whitespace().collect();
      if columns.len() >= 5 {
        format!("{} مستخدم / {} إجمالي", columns[2], columns[1])
      } else {
        line.to_string()
      }
    });

    let packages =
      text(app, &serial, &["shell", "pm", "list", "packages"]).unwrap_or_default();

    return Ok(Some(AndroidDevice {
      serial,
      state: "connected".to_string(),
      manufacturer,
      model,
      android_version,
      battery_level,
      storage_summary,
      whatsapp_installed: packages.lines().any(|line| line.trim() == "package:com.whatsapp"),
      whatsapp_business_installed: packages
        .lines()
        .any(|line| line.trim() == "package:com.whatsapp.w4b")
    }));
  }

  let probe = windows_phone_probe();
  if probe.usb_seen {
    return Ok(Some(AndroidDevice {
      serial: String::new(),
      state: "usb_only".to_string(),
      manufacturer: String::new(),
      model: probe.device_name.unwrap_or_else(|| "Android".to_string()),
      android_version: String::new(),
      battery_level: None,
      storage_summary: None,
      whatsapp_installed: false,
      whatsapp_business_installed: false
    }));
  }

  Ok(None)
}
