export type DeviceState = "connected" | "unauthorized" | "offline" | "none";

export interface AndroidDevice {
  serial: string;
  state: DeviceState;
  manufacturer: string;
  model: string;
  androidVersion: string;
  batteryLevel?: number;
  storageSummary?: string;
  whatsappInstalled: boolean;
  whatsappBusinessInstalled: boolean;
}

export type AndroidDiagnosticCode =
  | "connected"
  | "unauthorized"
  | "offline"
  | "usb_seen_no_adb"
  | "no_usb_device"
  | "adb_unavailable"
  | "adb_start_failed"
  | "adb_error";

export interface AndroidDiagnostic {
  code: AndroidDiagnosticCode;
  adbAvailable: boolean;
  adbServerRunning: boolean;
  adbPath: string;
  windowsUsbSeen: boolean;
  windowsDeviceName?: string | null;
  rawAdb?: string | null;
}

export interface TransferProgress {
  operation: "backup" | "restore";
  percent: number;
  stage: string;
  detail?: string;
}

export interface BackupSummary {
  variant: "personal" | "business";
  sourceSerial: string;
  createdUnix: number;
  databaseCount: number;
  totalBytes: number;
  mediaIncluded: boolean;
}

export interface RestoreOutcome {
  safetyBackup?: string | null;
  restoredFiles: number;
}

export type WhatsAppVariant = "personal" | "business";
