import { useEffect, useMemo, useState } from "react";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import {
  ArchiveRestore,
  HardDriveDownload,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  WifiOff
} from "lucide-react";
import iconUrl from "./assets/h-trans-icon.svg";
import { backend } from "./lib/backend";
import type { AndroidDevice, TransferProgress, WhatsAppVariant } from "./types";

const idle: TransferProgress = { operation: "backup", percent: 0, stage: "Ready" };

export default function App() {
  const [device, setDevice] = useState<AndroidDevice | null>(null);
  const [variant, setVariant] = useState<WhatsAppVariant>("personal");
  const [progress, setProgress] = useState<TransferProgress>(idle);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");

  const refresh = async () => {
    try {
      setDevice(await backend.detectDevice());
    } catch {
      setDevice(null);
    }
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 3000);
    let unlisten: (() => void) | undefined;
    backend.onProgress(setProgress).then((fn) => (unlisten = fn));

    return () => {
      window.clearInterval(timer);
      unlisten?.();
    };
  }, []);

  const connected = device?.state === "connected";
  const backupSupported = useMemo(
    () =>
      !!device &&
      (variant === "personal" ? device.whatsappInstalled : device.whatsappBusinessInstalled),
    [device, variant]
  );

  async function doBackup() {
    const destination = await save({
      title: "Save H TRANS backup",
      defaultPath: `H-TRANS_${device?.model || "Android"}_${variant}.htrans`,
      filters: [{ name: "H TRANS Backup", extensions: ["htrans"] }]
    });

    if (!destination) return;

    setRunning(true);
    setResult("");
    setProgress({ operation: "backup", percent: 0, stage: "Starting backup" });

    try {
      const saved = await backend.backupWhatsApp(variant, destination);
      setResult(`Backup verified and saved: ${saved}`);
    } catch (error) {
      setResult(`Backup failed: ${String(error)}`);
    } finally {
      setRunning(false);
    }
  }

  async function doRestore() {
    const selected = await open({
      title: "Select H TRANS backup",
      multiple: false,
      filters: [{ name: "H TRANS Backup", extensions: ["htrans"] }]
    });

    if (!selected || Array.isArray(selected)) return;

    try {
      const summary = await backend.inspectBackup(selected);
      const sizeMb = (summary.totalBytes / 1024 / 1024).toFixed(1);
      const approved = await confirm(
        [
          `This backup contains ${summary.databaseCount} encrypted chat database file(s) (${sizeMb} MB).`,
          "",
          "H TRANS will verify every file first.",
          "If WhatsApp is already installed, a Safety Backup of the current local chat backups is required before H TRANS replaces any msgstore files.",
          "Media is never modified.",
          "",
          "Continue?"
        ].join("\n"),
        { title: "H TRANS Restore", kind: "warning" }
      );

      if (!approved) return;
    } catch (error) {
      setResult(`Cannot open backup: ${String(error)}`);
      return;
    }

    setRunning(true);
    setResult("");
    setProgress({ operation: "restore", percent: 0, stage: "Starting restore" });

    try {
      const outcome = await backend.restoreWhatsApp(selected, variant);
      const safety = outcome.safetyBackup
        ? ` Safety backup: ${outcome.safetyBackup}`
        : " No safety backup was needed because no existing WhatsApp installation was detected.";
      setResult(
        `Restored ${outcome.restoredFiles} chat database file(s).${safety} Complete WhatsApp setup and choose the local backup when prompted.`
      );
    } catch (error) {
      setResult(`Restore failed: ${String(error)}`);
    } finally {
      setRunning(false);
      refresh();
    }
  }

  const statusText =
    device?.state === "unauthorized"
      ? "Unlock phone and tap Allow USB debugging"
      : device?.state === "offline"
        ? "Reconnect the USB cable"
        : connected
          ? "Connected"
          : "Waiting";

  return (
    <main className="shell">
      <header>
        <div className="brand">
          <img src={iconUrl} alt="H TRANS" />
          <div>
            <strong>H TRANS</strong>
            <span>Your chats. Your PC.</span>
          </div>
        </div>
        <button className="ghost" onClick={refresh} disabled={running}>
          <RefreshCw size={17} />
          Refresh
        </button>
      </header>

      <section className="grid">
        <article className="panel device">
          <div className="heading">
            <div>
              <p className="eyebrow">CONNECTED DEVICE</p>
              <h1>{connected ? "Android phone detected" : "Connect your Android phone"}</h1>
            </div>
            <span className={connected ? "status on" : "status"}>{statusText}</span>
          </div>

          <div className="stage">
            <div className="phone">
              <div className="screen">
                {connected ? (
                  <>
                    <Smartphone size={48} />
                    <strong>{device?.model}</strong>
                    <span>{device?.manufacturer}</span>
                    <small>Android {device?.androidVersion}</small>
                  </>
                ) : (
                  <>
                    <WifiOff size={46} />
                    <strong>{device?.state === "unauthorized" ? "Authorization required" : "No phone connected"}</strong>
                    <small>
                      {device?.state === "unauthorized"
                        ? "Unlock the phone and approve the USB debugging prompt."
                        : "Connect USB and enable USB debugging."}
                    </small>
                  </>
                )}
              </div>
            </div>

            <div className="facts">
              <Fact label="Serial" value={device?.serial || "—"} />
              <Fact
                label="Battery"
                value={device?.batteryLevel != null ? `${device.batteryLevel}%` : "—"}
              />
              <Fact label="Storage" value={device?.storageSummary || "—"} />
              <Fact label="Media policy" value="Always excluded" />
            </div>
          </div>
        </article>

        <article className="panel actions">
          <p className="eyebrow">SELECT DATA</p>
          <h2>WhatsApp chats</h2>
          <p className="muted">
            Chats only. Photos, videos, audio and documents are never included or modified.
          </p>

          <div className="choices">
            <Choice
              active={variant === "personal"}
              title="WhatsApp"
              sub={device?.whatsappInstalled ? "Detected" : "Not detected"}
              onClick={() => setVariant("personal")}
            />
            <Choice
              active={variant === "business"}
              title="WhatsApp Business"
              sub={device?.whatsappBusinessInstalled ? "Detected" : "Not detected"}
              onClick={() => setVariant("business")}
            />
          </div>

          <div className="privacy">
            <ShieldCheck size={20} />
            <span>100% local. H TRANS does not upload chat data.</span>
          </div>

          <div className="buttons">
            <button
              className="primary"
              disabled={!connected || !backupSupported || running}
              onClick={doBackup}
            >
              <HardDriveDownload size={19} />
              Backup
            </button>

            <button
              className="secondary"
              disabled={!connected || running}
              onClick={doRestore}
            >
              <ArchiveRestore size={19} />
              Restore
            </button>
          </div>

          <div className="progress">
            <div>
              <span>{progress.stage}</span>
              <strong>{progress.percent}%</strong>
            </div>
            <div className="track">
              <i style={{ width: `${progress.percent}%` }} />
            </div>
            <small>{progress.detail || (running ? "Do not disconnect your phone." : "Ready.")}</small>
          </div>

          {result && <p className="result">{result}</p>}
        </article>
      </section>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Choice({
  active,
  title,
  sub,
  onClick
}: {
  active: boolean;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "choice active" : "choice"} onClick={onClick}>
      <b>{active ? "✓" : ""}</b>
      <span>
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
    </button>
  );
}
