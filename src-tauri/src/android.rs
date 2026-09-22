use serde::Serialize;
use std::{
  path::PathBuf,
  process::{Command, Output}
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

pub fn adb(app: &AppHandle, args: &[&str]) -> Result<Output, AndroidError> {
  let output = Command::new(adb_path(app))
    .args(args)
    .output()
    .map_err(|_| AndroidError::AdbUnavailable)?;

  if output.status.success() {
    Ok(output)
  } else {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(AndroidError::CommandFailed(if stderr.is_empty() { stdout } else { stderr }))
  }
}

fn text(app: &AppHandle, serial: &str, args: &[&str]) -> Result<String, AndroidError> {
  let mut all = vec!["-s", serial];
  all.extend_from_slice(args);
  Ok(String::from_utf8_lossy(&adb(app, &all)?.stdout).trim().to_string())
}

pub fn detect_device(app: &AppHandle) -> Result<Option<AndroidDevice>, AndroidError> {
  let output = adb(app, &["devices"])?;
  let stdout = String::from_utf8_lossy(&output.stdout);

  let mut selected: Option<(String, String)> = None;
  for line in stdout.lines().skip(1) {
    let mut parts = line.split_whitespace();
    let (Some(serial), Some(state)) = (parts.next(), parts.next()) else {
      continue;
    };

    selected = Some((serial.to_string(), state.to_string()));
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
      format!("{} used / {} total", columns[2], columns[1])
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
