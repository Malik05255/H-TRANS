use base64::{engine::general_purpose::STANDARD, Engine as _};
use jpeg_encoder::{ColorType, Encoder as JpegEncoder};
use openh264::{decoder::Decoder, formats::YUVSource, nal_units};
use serde::Serialize;
use std::{
  io::Read,
  net::{TcpListener, TcpStream},
  path::PathBuf,
  process::{Child, Stdio},
  sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex, OnceLock
  },
  thread,
  time::{Duration, SystemTime, UNIX_EPOCH}
};
use tauri::{AppHandle, Emitter, Manager};

const SCRCPY_VERSION: &str = "3.3.4";
const SERVER_REMOTE_PATH: &str = "/data/local/tmp/htrans-scrcpy-server.jar";
const H264_CODEC_ID: u32 = u32::from_be_bytes(*b"h264");
const MAX_PACKET_BYTES: usize = 12 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MirrorFrame {
  session: u64,
  data_url: String,
  width: u32,
  height: u32,
  sequence: u64
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MirrorStatus {
  session: u64,
  state: String,
  detail: Option<String>
}

#[derive(Default)]
struct MirrorState {
  active_session: u64,
  cancel: Option<Arc<AtomicBool>>
}

static STATE: OnceLock<Mutex<MirrorState>> = OnceLock::new();
static NEXT_SESSION: AtomicU64 = AtomicU64::new(1);

fn state() -> &'static Mutex<MirrorState> {
  STATE.get_or_init(|| Mutex::new(MirrorState::default()))
}

fn emit_status(app: &AppHandle, session: u64, status: &str, detail: Option<String>) {
  let _ = app.emit(
    "mirror-status",
    MirrorStatus {
      session,
      state: status.to_string(),
      detail
    }
  );
}

fn server_path(app: &AppHandle) -> Result<PathBuf, String> {
  if let Ok(custom) = std::env::var("HTRANS_SCRCPY_SERVER") {
    let path = PathBuf::from(custom);
    if path.exists() {
      return Ok(path);
    }
  }

  let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
  [
    resources.join("scrcpy-server-v3.3.4"),
    resources.join("resources").join("scrcpy-server-v3.3.4")
  ]
  .into_iter()
  .find(|path| path.exists())
  .ok_or_else(|| "ملف محرك البث غير موجود في H TRANS.".to_string())
}

fn adb_checked(app: &AppHandle, serial: &str, args: &[&str]) -> Result<(), String> {
  let mut full = vec!["-s", serial];
  full.extend_from_slice(args);
  let output = crate::android::adb(app, &full).map_err(|e| e.to_string())?;
  if output.status.success() {
    Ok(())
  } else {
    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
  }
}

fn read_exact_cancelable(
  stream: &mut TcpStream,
  buffer: &mut [u8],
  cancel: &AtomicBool
) -> Result<(), String> {
  let mut offset = 0usize;
  while offset < buffer.len() {
    if cancel.load(Ordering::Relaxed) {
      return Err("cancelled".into());
    }

    match stream.read(&mut buffer[offset..]) {
      Ok(0) => return Err("انتهى بث الهاتف.".into()),
      Ok(read) => offset += read,
      Err(error)
        if error.kind() == std::io::ErrorKind::WouldBlock
          || error.kind() == std::io::ErrorKind::TimedOut =>
      {
        continue;
      }
      Err(error) => return Err(error.to_string())
    }
  }
  Ok(())
}

fn free_tcp_port() -> Result<u16, String> {
  let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
  listener
    .local_addr()
    .map(|address| address.port())
    .map_err(|e| e.to_string())
}

fn make_scid(port: u16, session: u64) -> u32 {
  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .subsec_nanos();
  let value = now ^ ((port as u32) << 8) ^ (session as u32) ^ std::process::id();
  (value & 0x7fff_ffff).max(1)
}

fn connect_stream(port: u16, cancel: &AtomicBool, child: &mut Child) -> Result<TcpStream, String> {
  for _ in 0..70 {
    if cancel.load(Ordering::Relaxed) {
      return Err("cancelled".into());
    }

    if let Ok(Some(status)) = child.try_wait() {
      return Err(format!("توقف محرك البث قبل الاتصال ({status})."));
    }

    match TcpStream::connect(("127.0.0.1", port)) {
      Ok(stream) => return Ok(stream),
      Err(_) => thread::sleep(Duration::from_millis(100))
    }
  }

  Err("تعذر إنشاء قناة الفيديو مع الهاتف.".into())
}

fn cleanup(app: &AppHandle, serial: &str, port: u16, child: &mut Child) {
  let _ = child.kill();
  let _ = child.wait();

  let port_spec = format!("tcp:{port}");
  let _ = crate::android::hidden_command(crate::android::adb_path(app))
    .args(["-s", serial, "forward", "--remove", &port_spec])
    .output();
}

fn run_session(
  app: AppHandle,
  serial: String,
  session: u64,
  cancel: Arc<AtomicBool>
) -> Result<(), String> {
  emit_status(&app, session, "starting", Some("تجهيز قناة الفيديو".into()));

  let peer = crate::android::peek_adb(&app)
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "ADB لا يرى الهاتف.".to_string())?;

  if peer.state != "device" || peer.serial != serial {
    return Err("الهاتف غير مصرح له عبر ADB.".into());
  }

  let server = server_path(&app)?;
  let server_text = server.to_string_lossy().to_string();
  adb_checked(
    &app,
    &serial,
    &["push", &server_text, SERVER_REMOTE_PATH]
  )?;

  let port = free_tcp_port()?;
  let session_id = make_scid(port, session);
  let socket_name = format!("localabstract:scrcpy_{session_id:08x}");
  let port_spec = format!("tcp:{port}");

  adb_checked(
    &app,
    &serial,
    &["forward", &port_spec, &socket_name]
  )?;

  let shell_command = format!(
    "CLASSPATH={SERVER_REMOTE_PATH} app_process / com.genymobile.scrcpy.Server {SCRCPY_VERSION} log_level=warn scid={session_id:08x} tunnel_forward=true audio=false control=false video_codec=h264 send_device_meta=false max_size=720 max_fps=12 video_bit_rate=3500000 cleanup=true"
  );

  let mut child = crate::android::hidden_command(crate::android::adb_path(&app))
    .args(["-s", &serial, "shell", &shell_command])
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| format!("تعذر تشغيل محرك الفيديو: {e}"))?;

  let result = (|| -> Result<(), String> {
    let mut stream = connect_stream(port, &cancel, &mut child)?;
    stream
      .set_read_timeout(Some(Duration::from_millis(700)))
      .map_err(|e| e.to_string())?;

    // Forward mode starts with one dummy byte, then codec id + width + height.
    let mut dummy = [0u8; 1];
    read_exact_cancelable(&mut stream, &mut dummy, &cancel)?;

    let mut metadata = [0u8; 12];
    read_exact_cancelable(&mut stream, &mut metadata, &cancel)?;

    let codec = u32::from_be_bytes(metadata[0..4].try_into().unwrap());
    if codec != H264_CODEC_ID {
      return Err(format!("ترميز الفيديو غير مدعوم: 0x{codec:08x}"));
    }

    let announced_width = u32::from_be_bytes(metadata[4..8].try_into().unwrap());
    let announced_height = u32::from_be_bytes(metadata[8..12].try_into().unwrap());

    emit_status(
      &app,
      session,
      "connected",
      Some(format!("{announced_width}x{announced_height}"))
    );

    let mut decoder = Decoder::new().map_err(|e| format!("تعذر تشغيل H.264 decoder: {e}"))?;
    let mut sequence = 0u64;
    let mut streaming_announced = false;

    loop {
      if cancel.load(Ordering::Relaxed) {
        return Ok(());
      }

      let mut header = [0u8; 12];
      read_exact_cancelable(&mut stream, &mut header, &cancel)?;

      let size = u32::from_be_bytes(header[8..12].try_into().unwrap()) as usize;
      if size == 0 || size > MAX_PACKET_BYTES {
        return Err(format!("حجم حزمة فيديو غير صالح: {size}"));
      }

      let mut payload = vec![0u8; size];
      read_exact_cancelable(&mut stream, &mut payload, &cancel)?;

      let mut latest_frame = None;
      for unit in nal_units(&payload) {
        let decoded = decoder
          .decode(unit)
          .map_err(|e| format!("فشل فك H.264: {e}"))?;
        if let Some(yuv) = decoded {
          latest_frame = Some(yuv);
        }
      }

      let Some(yuv) = latest_frame else {
        continue;
      };

      let (width, height) = yuv.dimensions();
      if width == 0 || height == 0 || width > u16::MAX as usize || height > u16::MAX as usize {
        continue;
      }

      let mut rgba = vec![0u8; yuv.rgba8_len()];
      yuv.write_rgba8(&mut rgba);

      let mut jpeg = Vec::with_capacity(rgba.len() / 5);
      JpegEncoder::new(&mut jpeg, 72)
        .encode(&rgba, width as u16, height as u16, ColorType::Rgba)
        .map_err(|e| format!("فشل تجهيز إطار الفيديو: {e}"))?;

      sequence += 1;
      let data_url = format!("data:image/jpeg;base64,{}", STANDARD.encode(jpeg));
      let _ = app.emit(
        "mirror-frame",
        MirrorFrame {
          session,
          data_url,
          width: width as u32,
          height: height as u32,
          sequence
        }
      );

      if !streaming_announced {
        streaming_announced = true;
        emit_status(&app, session, "streaming", Some("تم استلام أول إطار فعلي".into()));
      }
    }
  })();

  cleanup(&app, &serial, port, &mut child);
  result
}

pub fn start(app: &AppHandle, serial: &str) -> Result<u64, String> {
  if serial.trim().is_empty() {
    return Err("رقم الهاتف في ADB غير موجود.".into());
  }

  stop();

  let session = NEXT_SESSION.fetch_add(1, Ordering::Relaxed);
  let cancel = Arc::new(AtomicBool::new(false));

  {
    let mut guard = state().lock().map_err(|_| "تعذر بدء البث.".to_string())?;
    guard.active_session = session;
    guard.cancel = Some(cancel.clone());
  }

  let app_handle = app.clone();
  let serial_owned = serial.to_string();
  thread::spawn(move || {
    let result = run_session(app_handle.clone(), serial_owned, session, cancel.clone());

    if cancel.load(Ordering::Relaxed) {
      emit_status(&app_handle, session, "stopped", None);
    } else if let Err(error) = result {
      emit_status(&app_handle, session, "error", Some(error));
    }
  });

  Ok(session)
}

pub fn stop() {
  if let Ok(mut guard) = state().lock() {
    if let Some(cancel) = guard.cancel.take() {
      cancel.store(true, Ordering::Relaxed);
    }
    guard.active_session = 0;
  }
}
