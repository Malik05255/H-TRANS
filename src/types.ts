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
