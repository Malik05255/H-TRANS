import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AndroidDevice,
  BackupSummary,
  RestoreOutcome,
  TransferProgress,
  WhatsAppVariant
} from "../types";

export const backend = {
  detectDevice: () => invoke<AndroidDevice | null>("detect_android_device"),

  inspectBackup: (backupFile: string) =>
    invoke<BackupSummary>("inspect_htrans_backup", { backupFile }),

  backupWhatsApp: (variant: WhatsAppVariant, destination: string) =>
    invoke<string>("backup_whatsapp", { variant, destination }),

  restoreWhatsApp: (backupFile: string, variant: WhatsAppVariant) =>
    invoke<RestoreOutcome>("restore_whatsapp", { backupFile, variant }),

  onProgress: (handler: (progress: TransferProgress) => void): Promise<UnlistenFn> =>
    listen<TransferProgress>("transfer-progress", (event) => handler(event.payload))
};
