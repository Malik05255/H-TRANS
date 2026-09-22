import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AndroidDevice,
  AndroidDiagnostic,
  BackupSummary,
  RestoreOutcome,
  TransferProgress,
  UpdateInfo,
  UpdateProgress,
  WhatsAppVariant
} from "../types";

export const backend = {
  detectDevice: () => invoke<AndroidDevice | null>("detect_android_device"),
  diagnoseConnection: () => invoke<AndroidDiagnostic>("diagnose_android_connection"),
  repairConnection: () => invoke<AndroidDiagnostic>("repair_android_connection"),

  startLiveMirror: (
    serial: string,
    rect: { x: number; y: number; width: number; height: number }
  ) =>
    invoke<void>("start_live_mirror", {
      serial,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    }),

  resizeLiveMirror: (rect: { x: number; y: number; width: number; height: number }) =>
    invoke<void>("resize_live_mirror", {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    }),

  stopLiveMirror: () => invoke<void>("stop_live_mirror"),

  pairWireless: (endpoint: string, code: string) =>
    invoke<string>("pair_wireless_android", { endpoint, code }),
  connectWireless: (endpoint: string) =>
    invoke<string>("connect_wireless_android", { endpoint }),

  checkForUpdate: () => invoke<UpdateInfo | null>("check_for_update"),
  installUpdate: (info: UpdateInfo) => invoke<void>("download_and_install_update", { info }),

  inspectBackup: (backupFile: string) =>
    invoke<BackupSummary>("inspect_htrans_backup", { backupFile }),
  backupWhatsApp: (variant: WhatsAppVariant, destination: string) =>
    invoke<string>("backup_whatsapp", { variant, destination }),
  restoreWhatsApp: (backupFile: string, variant: WhatsAppVariant) =>
    invoke<RestoreOutcome>("restore_whatsapp", { backupFile, variant }),

  onProgress: (handler: (progress: TransferProgress) => void): Promise<UnlistenFn> =>
    listen<TransferProgress>("transfer-progress", (event) => handler(event.payload)),
  onUpdateProgress: (handler: (progress: UpdateProgress) => void): Promise<UnlistenFn> =>
    listen<UpdateProgress>("update-progress", (event) => handler(event.payload))
};
