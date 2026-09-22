import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AdbPeer,
  AndroidDevice,
  AndroidDiagnostic,
  BackupSummary,
  MirrorFrame,
  MirrorStatus,
  RestoreOutcome,
  TransferProgress,
  UpdateInfo,
  UpdateProgress,
  WhatsAppReadProbe,
  WhatsAppVariant
} from "../types";

export const backend = {
  detectDevice: () => invoke<AndroidDevice | null>("detect_android_device"),
  peekAdb: () => invoke<AdbPeer | null>("peek_android_adb"),
  diagnoseConnection: () => invoke<AndroidDiagnostic>("diagnose_android_connection"),
  repairConnection: () => invoke<AndroidDiagnostic>("repair_android_connection"),

  startLiveMirror: (serial: string) =>
    invoke<number>("start_live_mirror", { serial }),
  stopLiveMirror: () => invoke<void>("stop_live_mirror"),

  pairWireless: (endpoint: string, code: string) =>
    invoke<string>("pair_wireless_android", { endpoint, code }),
  connectWireless: (endpoint: string) =>
    invoke<string>("connect_wireless_android", { endpoint }),

  checkForUpdate: () => invoke<UpdateInfo | null>("check_for_update"),
  installUpdate: (info: UpdateInfo) => invoke<void>("download_and_install_update", { info }),

  probeWhatsappReadState: (variant: WhatsAppVariant) =>
    invoke<WhatsAppReadProbe>("probe_whatsapp_read_state", { variant }),

  inspectBackup: (backupFile: string) =>
    invoke<BackupSummary>("inspect_htrans_backup", { backupFile }),
  backupWhatsApp: (variant: WhatsAppVariant, destination: string) =>
    invoke<string>("backup_whatsapp", { variant, destination }),
  restoreWhatsApp: (backupFile: string, variant: WhatsAppVariant) =>
    invoke<RestoreOutcome>("restore_whatsapp", { backupFile, variant }),

  onMirrorFrame: (handler: (frame: MirrorFrame) => void): Promise<UnlistenFn> =>
    listen<MirrorFrame>("mirror-frame", (event) => handler(event.payload)),
  onMirrorStatus: (handler: (status: MirrorStatus) => void): Promise<UnlistenFn> =>
    listen<MirrorStatus>("mirror-status", (event) => handler(event.payload)),
  onProgress: (handler: (progress: TransferProgress) => void): Promise<UnlistenFn> =>
    listen<TransferProgress>("transfer-progress", (event) => handler(event.payload)),
  onUpdateProgress: (handler: (progress: UpdateProgress) => void): Promise<UnlistenFn> =>
    listen<UpdateProgress>("update-progress", (event) => handler(event.payload))
};
