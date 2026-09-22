use serde::Serialize;
use std::{
  path::PathBuf,
  process::{Command, Output},
  thread,
  time::Duration
};
use tauri::{AppHandle, Manager};
use thiserror::Error;

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
  pub adb_path: String,
  pub windows_usb_seen: bool,
  pub windows_device_name: Option<String>,
  pub raw_adb: Option<String>
}

pub fn adb_path(app: &AppHandle) -> PathBuf {
  if let Ok(custom) = std::env::var("HTRANS_ADB") {
    return PathBuf::from(custom);
  }

  if let Ok(resource_dir) = app.path().resource_dir() {
    let candidates = [
      resource_dir.join("platform-tools").join("adb.exe"),
      resource_dir.join("resources").join("platform-tools").join("adb.exe")
    ];

    for candidate in candidates {
      if candidate.exists() {
        return candidate;
      }
    }
  }

  PathBuf::from("adb")
}

fn raw_adb(app: &AppHandle, args: &[&str]) -> Result<Output, AndroidError> {
  Command::new(adb_path(app))
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
fn windows_phone_probe() -> (bool, Option<String>) {
  let script = r#"
$patterns = 'Android|ADB|MTP|Samsung|Galaxy|Pixel|Xiaomi|Redmi|POCO|OnePlus|OPPO|vivo|HONOR|HUAWEI|Motorola|realme|Nothing'
$items = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
  Where-Object {
    $_.FriendlyName -and
    ($_.FriendlyName -match $patterns -or $_.Class -eq 'AndroidUsbDeviceClass')
  } |
  Select-Object -ExpandProperty FriendlyName
$items | Select-Object -First 5
"#;

  let output = Command::new("powershell")
    .args(["-NoProfile", "-NonInteractive", "-Command", script])
    .output();

  let Ok(output) = output else {
    return (false, None);
  };

  let names = String::from_utf8_lossy(&output.stdout);
  let first = names
    .lines()
    .map(str::trim)
    .find(|line| !line.is_empty())
    .map(str::to_string);

  (first.is_some(), first)
}

#[cfg(not(target_os = "windows"))]
fn windows_phone_probe() -> (bool, Option<String>) {
  (false, None)
}

pub fn diagnose_connection(app: &AppHandle) -> AndroidDiagnostic {
  let path = adb_path(app);
  let adb_path_text = path.display().to_string();

  let version = Command::new(&path).arg("version").output();
  let Ok(version) = version else {
    let (windows_usb_seen, windows_device_name) = windows_phone_probe();
    return AndroidDiagnostic {
      code: "adb_unavailable".into(),
      adb_available: false,
      adb_server_running: false,
      adb_path: adb_path_text,
      windows_usb_seen,
      windows_device_name,
      raw_adb: None
    };
  };

  if !version.status.success() {
    let (windows_usb_seen, windows_device_name) = windows_phone_probe();
    return AndroidDiagnostic {
      code: "adb_unavailable".into(),
      adb_available: false,
      adb_server_running: false,
      adb_path: adb_path_text,
      windows_usb_seen,
      windows_device_name,
      raw_adb: Some(String::from_utf8_lossy(&version.stderr).trim().to_string())
    };
  }

  let server = Command::new(&path).arg("start-server").output();
  let server_running = server.as_ref().map(|out| out.status.success()).unwrap_or(false);

  if !server_running {
    let (windows_usb_seen, windows_device_name) = windows_phone_probe();
    let raw = server
      .ok()
      .map(|out| String::from_utf8_lossy(&out.stderr).trim().to_string());

    return AndroidDiagnostic {
      code: "adb_start_failed".into(),
      adb_available: true,
      adb_server_running: false,
      adb_path: adb_path_text,
      windows_usb_seen,
      windows_device_name,
      raw_adb: raw
    };
  }

  let devices = Command::new(&path).args(["devices", "-l"]).output();
  let Ok(devices) = devices else {
    let (windows_usb_seen, windows_device_name) = windows_phone_probe();
    return AndroidDiagnostic {
      code: "adb_error".into(),
      adb_available: true,
      adb_server_running: true,
      adb_path: adb_path_text,
      windows_usb_seen,
      windows_device_name,
      raw_adb: None
    };
  };

  let stdout = String::from_utf8_lossy(&devices.stdout).to_string();
  let parsed = parse_devices(&stdout);

  if parsed.iter().any(|(_, state)| state == "device") {
    return AndroidDiagnostic {
      code: "connected".into(),
      adb_available: true,
      adb_server_running: true,
      adb_path: adb_path_text,
      windows_usb_seen: true,
      windows_device_name: None,
      raw_adb: Some(stdout)
    };
  }

  if parsed.iter().any(|(_, state)| state == "unauthorized") {
    return AndroidDiagnostic {
      code: "unauthorized".into(),
      adb_available: true,
      adb_server_running: true,
      adb_path: adb_path_text,
      windows_usb_seen: true,
      windows_device_name: None,
      raw_adb: Some(stdout)
    };
  }

  if parsed.iter().any(|(_, state)| state == "offline") {
    return AndroidDiagnostic {
      code: "offline".into(),
      adb_available: true,
      adb_server_running: true,
      adb_path: adb_path_text,
      windows_usb_seen: true,
      windows_device_name: None,
      raw_adb: Some(stdout)
    };
  }

  let (windows_usb_seen, windows_device_name) = windows_phone_probe();

  AndroidDiagnostic {
    code: if windows_usb_seen {
      "usb_seen_no_adb".into()
    } else {
      "no_usb_device".into()
    },
    adb_available: true,
    adb_server_running: true,
    adb_path: adb_path_text,
    windows_usb_seen,
    windows_device_name,
    raw_adb: Some(stdout)
  }
}

pub fn repair_connection(app: &AppHandle) -> AndroidDiagnostic {
  let path = adb_path(app);
  let _ = Command::new(&path).arg("kill-server").output();
  thread::sleep(Duration::from_millis(350));
  let _ = Command::new(&path).arg("start-server").output();
  thread::sleep(Duration::from_millis(700));
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

  let Some((serial, raw_state)) = selected else {
    return Ok(None);
  };

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

  Ok(Some(AndroidDevice {
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
  }))
}
