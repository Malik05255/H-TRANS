mod android;
mod whatsapp;

use android::AndroidDevice;
use tauri::AppHandle;
use whatsapp::{BackupSummary, RestoreOutcome};

#[tauri::command]
fn detect_android_device(app: AppHandle) -> Result<Option<AndroidDevice>, String> {
  android::detect_device(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn inspect_htrans_backup(backup_file: String) -> Result<BackupSummary, String> {
  whatsapp::inspect_backup(&backup_file).map_err(|e| e.to_string())
}

#[tauri::command]
fn backup_whatsapp(app: AppHandle, variant: String, destination: String) -> Result<String, String> {
  whatsapp::backup(&app, &variant, &destination).map_err(|e| e.to_string())
}

#[tauri::command]
fn restore_whatsapp(
  app: AppHandle,
  backup_file: String,
  variant: String
) -> Result<RestoreOutcome, String> {
  whatsapp::restore(&app, &backup_file, &variant).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      detect_android_device,
      inspect_htrans_backup,
      backup_whatsapp,
      restore_whatsapp
    ])
    .run(tauri::generate_context!())
    .expect("error while running H TRANS");
}
