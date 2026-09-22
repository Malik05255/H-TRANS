use reqwest::blocking::Client;
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
  fs::File,
  io::{Read, Write},
  path::PathBuf,
  process::Command
};
use tauri::{AppHandle, Emitter};

const LATEST_URL: &str =
  "https://github.com/Malik05255/H-TRANS/releases/latest/download/latest.json";
const ALLOWED_PREFIX: &str =
  "https://github.com/Malik05255/H-TRANS/releases/download/";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
  pub version: String,
  pub url: String,
  pub sha256: String
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
  percent: u8,
  stage: String,
  detail: Option<String>
}

fn client() -> Result<Client, String> {
  Client::builder()
    .user_agent("H-TRANS-Updater")
    .build()
    .map_err(|e| e.to_string())
}

pub fn check_for_update() -> Result<Option<UpdateInfo>, String> {
  let response = client()?.get(LATEST_URL).send().map_err(|e| e.to_string())?;
  if !response.status().is_success() {
    return Ok(None);
  }

  let info: UpdateInfo = response.json().map_err(|e| e.to_string())?;
  if !info.url.starts_with(ALLOWED_PREFIX) {
    return Err("Update URL is not an approved H TRANS release URL.".into());
  }

  let current = Version::parse(env!("CARGO_PKG_VERSION")).map_err(|e| e.to_string())?;
  let latest = Version::parse(info.version.trim_start_matches('v')).map_err(|e| e.to_string())?;

  if latest > current { Ok(Some(info)) } else { Ok(None) }
}

pub fn download_and_install(app: &AppHandle, info: UpdateInfo) -> Result<(), String> {
  if !info.url.starts_with(ALLOWED_PREFIX) {
    return Err("Update URL is not an approved H TRANS release URL.".into());
  }

  let mut response = client()?
    .get(&info.url)
    .send()
    .and_then(|response| response.error_for_status())
    .map_err(|e| e.to_string())?;

  let total = response.content_length().unwrap_or(0);
  let installer: PathBuf = std::env::temp_dir().join("H-TRANS-update.exe");
  let mut output = File::create(&installer).map_err(|e| e.to_string())?;
  let mut hasher = Sha256::new();
  let mut buffer = [0u8; 128 * 1024];
  let mut downloaded = 0u64;

  loop {
    let read = response.read(&mut buffer).map_err(|e| e.to_string())?;
    if read == 0 { break; }

    output.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
    hasher.update(&buffer[..read]);
    downloaded += read as u64;

    let percent = if total == 0 { 0 } else {
      ((downloaded as f64 / total as f64) * 94.0).round() as u8
    };

    let _ = app.emit("update-progress", UpdateProgress {
      percent,
      stage: "Downloading update".into(),
      detail: Some(format!("{} / {} bytes", downloaded, total))
    });
  }

  output.flush().map_err(|e| e.to_string())?;
  let actual = format!("{:x}", hasher.finalize());

  if !actual.eq_ignore_ascii_case(info.sha256.trim()) {
    let _ = std::fs::remove_file(&installer);
    return Err("Update checksum verification failed.".into());
  }

  let _ = app.emit("update-progress", UpdateProgress {
    percent: 98,
    stage: "Installing update".into(),
    detail: None
  });

  #[cfg(target_os = "windows")]
  {
    // Prevent the updater from racing with the ADB server or the running app.
    crate::android::stop_adb_server(app);
    std::thread::sleep(std::time::Duration::from_millis(450));

    let installer_text = installer
      .to_str()
      .ok_or_else(|| "Invalid installer path.".to_string())?
      .replace(''', "''");

    let script = format!(
      "Start-Sleep -Milliseconds 1200; Start-Process -FilePath '{}' -ArgumentList '/S'",
      installer_text
    );

    Command::new("powershell")
      .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
      .spawn()
      .map_err(|e| e.to_string())?;

    app.exit(0);
    Ok(())
  }

  #[cfg(not(target_os = "windows"))]
  {
    Err("Automatic installation is currently supported on Windows only.".into())
  }
}
