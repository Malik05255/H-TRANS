export type DeviceState = "connected" | "usb_only" | "unauthorized" | "offline" | "none";

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

export interface AdbPeer {
  serial: string;
  state: "device" | "unauthorized" | "offline" | string;
}

export type AndroidDiagnosticCode =
  | "connected"
  | "unauthorized"
  | "offline"
  | "usb_seen_no_adb"
  | "adb_interface_not_ready"
  | "adb_interface_missing"
  | "no_usb_device"
  | "adb_unavailable"
  | "adb_start_failed"
  | "adb_error";

export interface AndroidDiagnostic {
  code: AndroidDiagnosticCode;
  adbAvailable: boolean;
  adbServerRunning: boolean;
  adbDeviceSeen: boolean;
  adbInterfaceSeen: boolean;
  adbPath: string;
  windowsUsbSeen: boolean;
  windowsDeviceName?: string | null;
  windowsDeviceStatus?: string | null;
  rawAdb?: string | null;
}

export interface TransferProgress {
  operation: "backup" | "restore";
  percent: number;
  stage: string;
  detail?: string;
}

export interface UpdateInfo {
  version: string;
  url: string;
  sha256: string;
}

export interface UpdateProgress {
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
