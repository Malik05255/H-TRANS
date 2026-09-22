use crate::android;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
  fs::{self, File},
  io::{Read, Write},
  path::{Path, PathBuf},
  process::Stdio,
  time::{SystemTime, UNIX_EPOCH}
};
use tauri::{AppHandle, Emitter, Manager};
use tempfile::tempdir;
use thiserror::Error;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

#[derive(Debug, Error)]
pub enum WhatsAppError {
  #[error("No authorized Android device is connected.")]
  NoDevice,
  #[error("Unsupported WhatsApp variant: {0}")]
  UnsupportedVariant(String),
  #[error("No local WhatsApp chat backup was found on the phone.")]
  DatabaseMissing,
  #[error("H TRANS cannot safely restore over an existing WhatsApp installation because no current local msgstore backup was found. Create a WhatsApp backup first, then retry.")]
  SafetyBackupRequired,
  #[error("Invalid or damaged H TRANS backup: {0}")]
  InvalidBackup(String),
  #[error("ADB error: {0}")]
  Adb(String),
  #[error("Path error: {0}")]
  Path(String),
  #[error(transparent)]
  Io(#[from] std::io::Error),
  #[error(transparent)]
  Zip(#[from] zip::result::ZipError)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TransferProgress {
  operation: &'static str,
  percent: u8,
  stage: String,
  detail: Option<String>
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
  pub variant: String,
  pub source_serial: String,
  pub created_unix: u64,
  pub database_count: usize,
  pub total_bytes: u64,
  pub media_included: bool
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcome {
  pub safety_backup: Option<String>,
  pub restored_files: usize
}

#[derive(Debug, Serialize, Deserialize)]
struct Manifest {
  format: String,
  version: u32,
  created_unix: u64,
  variant: String,
  package: String,
  source_serial: String,
  media_included: bool,
  database_files: Vec<ManifestFile>
}

#[derive(Debug, Serialize, Deserialize)]
struct ManifestFile {
  name: String,
  sha256: String,
  bytes: u64
}

#[derive(Debug, Clone)]
struct RemoteFile {
  name: String,
  path: String,
  bytes: u64
}

struct VariantInfo {
  package: &'static str,
  database_dir: &'static str
}

fn variant_info(variant: &str) -> Result<VariantInfo, WhatsAppError> {
  match variant {
    "personal" => Ok(VariantInfo {
      package: "com.whatsapp",
      database_dir: "/sdcard/Android/media/com.whatsapp/WhatsApp/Databases"
    }),
    "business" => Ok(VariantInfo {
      package: "com.whatsapp.w4b",
      database_dir: "/sdcard/Android/media/com.whatsapp.w4b/WhatsApp Business/Databases"
    }),
    other => Err(WhatsAppError::UnsupportedVariant(other.to_string()))
  }
}

fn emit(
  app: &AppHandle,
  operation: &'static str,
  percent: u8,
  stage: &str,
  detail: Option<String>
) {
  let _ = app.emit(
    "transfer-progress",
    TransferProgress {
      operation,
      percent: percent.min(100),
      stage: stage.to_string(),
      detail
    }
  );
}

fn connected_device(app: &AppHandle) -> Result<android::AndroidDevice, WhatsAppError> {
  android::detect_device(app)
    .map_err(|e| WhatsAppError::Adb(e.to_string()))?
    .filter(|device| device.state == "connected")
    .ok_or(WhatsAppError::NoDevice)
}

fn quote_shell(value: &str) -> String {
  // H TRANS only quotes fixed WhatsApp paths and WhatsApp-generated msgstore filenames.
  format!("'{}'", value)
}

fn shell_text(app: &AppHandle, serial: &str, command: &str) -> Result<String, WhatsAppError> {
  let output = android::adb(app, &["-s", serial, "shell", command])
    .map_err(|e| WhatsAppError::Adb(e.to_string()))?;
  Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn sha256_file(path: &Path) -> Result<String, WhatsAppError> {
  let mut file = File::open(path)?;
  let mut hasher = Sha256::new();
  let mut buffer = [0u8; 128 * 1024];

  loop {
    let read = file.read(&mut buffer)?;
    if read == 0 {
      break;
    }
    hasher.update(&buffer[..read]);
  }

  Ok(format!("{:x}", hasher.finalize()))
}

fn remote_database_files(
  app: &AppHandle,
  serial: &str,
  database_dir: &str
) -> Result<Vec<RemoteFile>, WhatsAppError> {
  let command = format!(
    "for f in {}/msgstore*.crypt*; do [ -f \"$f\" ] || continue; size=$(wc -c < \"$f\"); printf '%s|%s\\n' \"$size\" \"$f\"; done",
    quote_shell(database_dir)
  );

  let output = shell_text(app, serial, &command)?;
  let mut files = Vec::new();

  for line in output.lines() {
    let Some((size, path)) = line.split_once('|') else {
      continue;
    };

    let Ok(bytes) = size.trim().parse::<u64>() else {
      continue;
    };

    let path = path.trim().to_string();
    let name = path
      .rsplit('/')
      .next()
      .unwrap_or("msgstore.db.crypt")
      .to_string();

    files.push(RemoteFile { name, path, bytes });
  }

  files.sort_by(|a, b| a.name.cmp(&b.name));
  Ok(files)
}

fn pull_remote_file(
  app: &AppHandle,
  serial: &str,
  remote: &RemoteFile,
  local: &Path,
  completed_before: u64,
  total_bytes: u64,
  operation: &'static str,
  start_percent: u8,
  end_percent: u8,
  stage: &str
) -> Result<(), WhatsAppError> {
  let command = format!("cat {}", quote_shell(&remote.path));
  let mut child = android::hidden_command(android::adb_path(app))
    .args(["-s", serial, "exec-out", &command])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|e| WhatsAppError::Adb(e.to_string()))?;

  let mut stdout = child.stdout.take().ok_or_else(|| WhatsAppError::Adb("ADB stdout unavailable".into()))?;
  let mut output = File::create(local)?;
  let mut buffer = [0u8; 128 * 1024];
  let mut current = 0u64;

  loop {
    let read = stdout.read(&mut buffer)?;
    if read == 0 {
      break;
    }

    output.write_all(&buffer[..read])?;
    current += read as u64;

    let done = completed_before.saturating_add(current);
    let ratio = if total_bytes == 0 {
      1.0
    } else {
      (done as f64 / total_bytes as f64).clamp(0.0, 1.0)
    };
    let percent =
      start_percent as f64 + ratio * (end_percent.saturating_sub(start_percent)) as f64;

    emit(
      app,
      operation,
      percent.round() as u8,
      stage,
      Some(format!("{} / {} bytes", done, total_bytes))
    );
  }

  let status = child.wait()?;
  if !status.success() {
    let mut stderr_text = String::new();
    if let Some(mut stderr) = child.stderr.take() {
      let _ = stderr.read_to_string(&mut stderr_text);
    }
    return Err(WhatsAppError::Adb(stderr_text));
  }

  let written = fs::metadata(local)?.len();
  if written != remote.bytes {
    return Err(WhatsAppError::InvalidBackup(format!(
      "ADB read size mismatch for {} (expected {}, got {})",
      remote.name, remote.bytes, written
    )));
  }

  Ok(())
}

fn push_local_file(
  app: &AppHandle,
  serial: &str,
  local: &Path,
  remote_path: &str,
  completed_before: u64,
  total_bytes: u64,
  operation: &'static str,
  start_percent: u8,
  end_percent: u8
) -> Result<(), WhatsAppError> {
  let command = format!("cat > {}", quote_shell(remote_path));
  let mut child = android::hidden_command(android::adb_path(app))
    .args(["-s", serial, "exec-in", &command])
    .stdin(Stdio::piped())
    .stdout(Stdio::null())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|e| WhatsAppError::Adb(e.to_string()))?;

  let mut input = File::open(local)?;
  let mut stdin = child.stdin.take().ok_or_else(|| WhatsAppError::Adb("ADB stdin unavailable".into()))?;
  let mut buffer = [0u8; 128 * 1024];
  let mut current = 0u64;

  loop {
    let read = input.read(&mut buffer)?;
    if read == 0 {
      break;
    }

    stdin.write_all(&buffer[..read])?;
    current += read as u64;

    let done = completed_before.saturating_add(current);
    let ratio = if total_bytes == 0 {
      1.0
    } else {
      (done as f64 / total_bytes as f64).clamp(0.0, 1.0)
    };
    let percent =
      start_percent as f64 + ratio * (end_percent.saturating_sub(start_percent)) as f64;

    emit(
      app,
      operation,
      percent.round() as u8,
      "Restoring chat database",
      Some(format!("{} / {} bytes", done, total_bytes))
    );
  }

  drop(stdin);
  let status = child.wait()?;
  if !status.success() {
    let mut stderr_text = String::new();
    if let Some(mut stderr) = child.stderr.take() {
      let _ = stderr.read_to_string(&mut stderr_text);
    }
    return Err(WhatsAppError::Adb(stderr_text));
  }

  Ok(())
}

fn package_files(
  app: &AppHandle,
  operation: &'static str,
  variant: &str,
  package: &str,
  serial: &str,
  files: &[PathBuf],
  destination: &Path,
  start_percent: u8,
  end_percent: u8,
  stage: &str
) -> Result<(), WhatsAppError> {
  if let Some(parent) = destination.parent() {
    fs::create_dir_all(parent)?;
  }

  let mut manifest_files = Vec::new();
  for file in files {
    let name = file
      .file_name()
      .and_then(|value| value.to_str())
      .ok_or_else(|| WhatsAppError::InvalidBackup("invalid database filename".into()))?
      .to_string();

    manifest_files.push(ManifestFile {
      name,
      sha256: sha256_file(file)?,
      bytes: fs::metadata(file)?.len()
    });
  }

  let manifest = Manifest {
    format: "H-TRANS-WHATSAPP".to_string(),
    version: 2,
    created_unix: SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap_or_default()
      .as_secs(),
    variant: variant.to_string(),
    package: package.to_string(),
    source_serial: serial.to_string(),
    media_included: false,
    database_files: manifest_files
  };

  let mut zip = ZipWriter::new(File::create(destination)?);
  let options =
    SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

  zip.start_file("manifest.json", options)?;
  zip.write_all(
    &serde_json::to_vec_pretty(&manifest)
      .map_err(|e| WhatsAppError::InvalidBackup(e.to_string()))?
  )?;

  let total_bytes: u64 = files
    .iter()
    .map(|file| fs::metadata(file).map(|metadata| metadata.len()).unwrap_or(0))
    .sum();
  let mut completed = 0u64;
  let span = end_percent.saturating_sub(start_percent);

  for file in files {
    let name = file
      .file_name()
      .and_then(|value| value.to_str())
      .unwrap_or("msgstore.db.crypt");

    zip.start_file(format!("databases/{name}"), options)?;
    let mut input = File::open(file)?;
    let mut buffer = [0u8; 128 * 1024];

    loop {
      let read = input.read(&mut buffer)?;
      if read == 0 {
        break;
      }

      zip.write_all(&buffer[..read])?;
      completed += read as u64;

      let ratio = if total_bytes == 0 {
        1.0
      } else {
        (completed as f64 / total_bytes as f64).clamp(0.0, 1.0)
      };
      emit(
        app,
        operation,
        start_percent + (ratio * span as f64).round() as u8,
        stage,
        Some(name.to_string())
      );
    }
  }

  zip.finish()?;
  verify_archive(destination)?;
  Ok(())
}

fn verify_archive(path: &Path) -> Result<Manifest, WhatsAppError> {
  let mut archive = ZipArchive::new(File::open(path)?)?;

  let manifest: Manifest = {
    let mut entry = archive
      .by_name("manifest.json")
      .map_err(|_| WhatsAppError::InvalidBackup("manifest.json is missing".into()))?;

    let mut json = String::new();
    entry.read_to_string(&mut json)?;
    serde_json::from_str(&json)
      .map_err(|e| WhatsAppError::InvalidBackup(format!("invalid manifest: {e}")))?
  };

  if manifest.format != "H-TRANS-WHATSAPP"
    || !(manifest.version == 1 || manifest.version == 2)
    || manifest.media_included
    || manifest.database_files.is_empty()
  {
    return Err(WhatsAppError::InvalidBackup(
      "unsupported H TRANS backup format".into()
    ));
  }

  for expected in &manifest.database_files {
    let archive_name = format!("databases/{}", expected.name);
    let mut entry = archive
      .by_name(&archive_name)
      .map_err(|_| WhatsAppError::InvalidBackup(format!("missing {}", expected.name)))?;

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 128 * 1024];
    let mut bytes = 0u64;

    loop {
      let read = entry.read(&mut buffer)?;
      if read == 0 {
        break;
      }

      bytes += read as u64;
      hasher.update(&buffer[..read]);
    }

    let hash = format!("{:x}", hasher.finalize());
    if bytes != expected.bytes || hash != expected.sha256 {
      return Err(WhatsAppError::InvalidBackup(format!(
        "checksum verification failed for {}",
        expected.name
      )));
    }
  }

  Ok(manifest)
}

pub fn inspect_backup(backup_file: &str) -> Result<BackupSummary, WhatsAppError> {
  let manifest = verify_archive(Path::new(backup_file))?;
  Ok(BackupSummary {
    variant: manifest.variant,
    source_serial: manifest.source_serial,
    created_unix: manifest.created_unix,
    database_count: manifest.database_files.len(),
    total_bytes: manifest.database_files.iter().map(|file| file.bytes).sum(),
    media_included: manifest.media_included
  })
}

pub fn backup(
  app: &AppHandle,
  variant: &str,
  destination: &str
) -> Result<String, WhatsAppError> {
  let info = variant_info(variant)?;
  let device = connected_device(app)?;

  emit(
    app,
    "backup",
    2,
    "Checking device",
    Some(format!("{} {}", device.manufacturer, device.model))
  );

  let remote_files = remote_database_files(app, &device.serial, info.database_dir)?;
  if remote_files.is_empty() {
    return Err(WhatsAppError::DatabaseMissing);
  }

  let temp = tempdir()?;
  let total_bytes: u64 = remote_files.iter().map(|file| file.bytes).sum();
  let mut completed = 0u64;
  let mut local_files = Vec::new();

  for remote in &remote_files {
    let local = temp.path().join(&remote.name);
    pull_remote_file(
      app,
      &device.serial,
      remote,
      &local,
      completed,
      total_bytes,
      "backup",
      8,
      58,
      "Copying encrypted chat data"
    )?;
    completed += remote.bytes;
    local_files.push(local);
  }

  let target = PathBuf::from(destination);
  package_files(
    app,
    "backup",
    variant,
    info.package,
    &device.serial,
    &local_files,
    &target,
    62,
    94,
    "Creating H TRANS backup"
  )?;

  emit(
    app,
    "backup",
    100,
    "Backup complete",
    Some(target.display().to_string())
  );

  Ok(target.display().to_string())
}

fn create_safety_backup(
  app: &AppHandle,
  variant: &str,
  info: &VariantInfo,
  serial: &str
) -> Result<Option<PathBuf>, WhatsAppError> {
  let remote_files = remote_database_files(app, serial, info.database_dir)?;
  if remote_files.is_empty() {
    return Ok(None);
  }

  emit(
    app,
    "restore",
    10,
    "Creating Safety Backup",
    Some("Copying current local WhatsApp chat backups before any changes".into())
  );

  let temp = tempdir()?;
  let total_bytes: u64 = remote_files.iter().map(|file| file.bytes).sum();
  let mut completed = 0u64;
  let mut local_files = Vec::new();

  for remote in &remote_files {
    let local = temp.path().join(&remote.name);
    pull_remote_file(
      app,
      serial,
      remote,
      &local,
      completed,
      total_bytes,
      "restore",
      11,
      27,
      "Creating Safety Backup"
    )?;
    completed += remote.bytes;
    local_files.push(local);
  }

  let documents = app
    .path()
    .document_dir()
    .map_err(|e| WhatsAppError::Path(e.to_string()))?;
  let safety_dir = documents.join("H TRANS").join("Safety Backups");
  fs::create_dir_all(&safety_dir)?;

  let stamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs();
  let destination =
    safety_dir.join(format!("H-TRANS_SAFETY_{}_{}.htrans", variant, stamp));

  package_files(
    app,
    "restore",
    variant,
    info.package,
    serial,
    &local_files,
    &destination,
    28,
    38,
    "Verifying Safety Backup"
  )?;

  emit(
    app,
    "restore",
    39,
    "Safety Backup verified",
    Some(destination.display().to_string())
  );

  Ok(Some(destination))
}

fn package_is_installed(device: &android::AndroidDevice, variant: &str) -> bool {
  match variant {
    "personal" => device.whatsapp_installed,
    "business" => device.whatsapp_business_installed,
    _ => false
  }
}

fn verify_remote_file(
  app: &AppHandle,
  serial: &str,
  remote_path: &str,
  expected_hash: &str,
  expected_bytes: u64
) -> Result<(), WhatsAppError> {
  let quoted = quote_shell(remote_path);
  let hash_command = format!(
    "(sha256sum {q} 2>/dev/null || toybox sha256sum {q} 2>/dev/null || true) | head -n 1",
    q = quoted
  );

  let hash_output = shell_text(app, serial, &hash_command)?;
  if let Some(hash) = hash_output.split_whitespace().next() {
    if hash.len() == 64 {
      if hash.eq_ignore_ascii_case(expected_hash) {
        return Ok(());
      }
      return Err(WhatsAppError::InvalidBackup(format!(
        "device checksum mismatch for {}",
        remote_path
      )));
    }
  }

  let size_output = shell_text(
    app,
    serial,
    &format!("wc -c < {}", quote_shell(remote_path))
  )?;
  let actual_size = size_output
    .trim()
    .parse::<u64>()
    .map_err(|_| WhatsAppError::InvalidBackup("unable to verify restored file size".into()))?;

  if actual_size != expected_bytes {
    return Err(WhatsAppError::InvalidBackup(format!(
      "device size mismatch for {}",
      remote_path
    )));
  }

  Ok(())
}

pub fn restore(
  app: &AppHandle,
  backup_file: &str,
  variant: &str
) -> Result<RestoreOutcome, WhatsAppError> {
  let info = variant_info(variant)?;
  let device = connected_device(app)?;

  emit(
    app,
    "restore",
    2,
    "Validating H TRANS backup",
    Some("Checking every embedded chat database checksum".into())
  );

  let source = PathBuf::from(backup_file);
  let manifest = verify_archive(&source)?;

  if manifest.variant != variant {
    return Err(WhatsAppError::InvalidBackup(format!(
      "selected backup is for {}, not {}",
      manifest.variant, variant
    )));
  }

  let installed = package_is_installed(&device, variant);
  let safety_backup = if installed {
    let safety = create_safety_backup(app, variant, &info, &device.serial)?;
    if safety.is_none() {
      return Err(WhatsAppError::SafetyBackupRequired);
    }
    safety
  } else {
    emit(
      app,
      "restore",
      39,
      "Fresh restore mode",
      Some("No existing WhatsApp installation detected; Safety Backup is not required".into())
    );
    None
  };

  if installed {
    let _ = android::adb(
      app,
      &["-s", &device.serial, "shell", "am", "force-stop", info.package]
    );
  }

  let temp = tempdir()?;
  emit(app, "restore", 42, "Extracting verified chat databases", None);

  {
    let mut archive = ZipArchive::new(File::open(&source)?)?;
    for expected in &manifest.database_files {
      let archive_name = format!("databases/{}", expected.name);
      let mut item = archive
        .by_name(&archive_name)
        .map_err(|_| WhatsAppError::InvalidBackup(format!("missing {}", expected.name)))?;

      let output_path = temp.path().join(&expected.name);
      let mut output = File::create(&output_path)?;
      std::io::copy(&mut item, &mut output)?;

      if sha256_file(&output_path)? != expected.sha256
        || fs::metadata(&output_path)?.len() != expected.bytes
      {
        return Err(WhatsAppError::InvalidBackup(format!(
          "extracted checksum mismatch for {}",
          expected.name
        )));
      }
    }
  }

  let database_dir = quote_shell(info.database_dir);
  shell_text(
    app,
    &device.serial,
    &format!("mkdir -p {database_dir}")
  )?;

  emit(
    app,
    "restore",
    48,
    "Preparing local backup folder",
    Some("Only msgstore database files are replaced. Media is untouched.".into())
  );

  shell_text(
    app,
    &device.serial,
    &format!("rm -f {}/msgstore*.crypt*", database_dir)
  )?;

  let total_bytes: u64 = manifest.database_files.iter().map(|file| file.bytes).sum();
  let mut completed = 0u64;

  for expected in &manifest.database_files {
    let local = temp.path().join(&expected.name);
    let remote = format!("{}/{}", info.database_dir, expected.name);

    push_local_file(
      app,
      &device.serial,
      &local,
      &remote,
      completed,
      total_bytes,
      "restore",
      50,
      90
    )?;

    completed += expected.bytes;
  }

  emit(app, "restore", 92, "Verifying restored files on phone", None);

  for expected in &manifest.database_files {
    let remote = format!("{}/{}", info.database_dir, expected.name);
    verify_remote_file(
      app,
      &device.serial,
      &remote,
      &expected.sha256,
      expected.bytes
    )?;
  }

  emit(
    app,
    "restore",
    100,
    "Restore files ready",
    Some(
      "H TRANS has restored the encrypted local chat backups. Complete WhatsApp setup and select the local backup when prompted."
        .into()
    )
  );

  Ok(RestoreOutcome {
    safety_backup: safety_backup.map(|path| path.display().to_string()),
    restored_files: manifest.database_files.len()
  })
}
