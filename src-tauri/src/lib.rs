mod android;
mod update;
mod whatsapp;

use android::{AndroidDevice, AndroidDiagnostic};
use tauri::AppHandle;
use update::UpdateInfo;
use whatsapp::{BackupSummary, RestoreOutcome};

#[tauri::command]
fn detect_android_device(app: AppHandle) -> Result<Option<AndroidDevice>, String> {
  android::detect_device(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn diagnose_android_connection(app: AppHandle) -> AndroidDiagnostic {
  android::diagnose_connection(&app)
}

#[tauri::command]
fn repair_android_connection(app: AppHandle) -> AndroidDiagnostic {
  android::repair_connection(&app)
}

#[tauri::command]
fn pair_wireless_android(app: AppHandle, endpoint: String, code: String) -> Result<String, String> {
  android::pair_wireless(&app, &endpoint, &code).map_err(|e| e.to_string())
}

#[tauri::command]
fn connect_wireless_android(app: AppHandle, endpoint: String) -> Result<String, String> {
  android::connect_wireless(&app, &endpoint).map_err(|e| e.to_string())
}

#[tauri::command]
fn check_for_update() -> Result<Option<UpdateInfo>, String> {
  update::check_for_update()
}

#[tauri::command]
fn download_and_install_update(app: AppHandle, info: UpdateInfo) -> Result<(), String> {
  update::download_and_install(&app, info)
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
fn restore_whatsapp(app: AppHandle, backup_file: String, variant: String) -> Result<RestoreOutcome, String> {
  whatsapp::restore(&app, &backup_file, &variant).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      let handle = app.handle().clone();
      std::thread::spawn(move || {
        let _ = android::start_adb_server(&handle);
      });
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      detect_android_device,
      diagnose_android_connection,
      repair_android_connection,
      pair_wireless_android,
      connect_wireless_android,
      check_for_update,
      download_and_install_update,
      inspect_htrans_backup,
      backup_whatsapp,
      restore_whatsapp
    ])
    .run(tauri::generate_context!())
    .expect("error while running H TRANS");
}
