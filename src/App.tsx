import { useEffect, useMemo, useState } from "react";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import {
  ArchiveRestore,
  Cable,
  HardDriveDownload,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wrench,
  WifiOff
} from "lucide-react";
import iconUrl from "./assets/h-trans-icon.svg";
import {
  ar,
  diagnosticText,
  translateBackendError,
  translateDetail,
  translateStage
} from "./i18n/ar";
import { backend } from "./lib/backend";
import type {
  AndroidDevice,
  AndroidDiagnostic,
  TransferProgress,
  WhatsAppVariant
} from "./types";

const idle: TransferProgress = { operation: "backup", percent: 0, stage: "Ready" };

export default function App() {
  const [device, setDevice] = useState<AndroidDevice | null>(null);
  const [diagnostic, setDiagnostic] = useState<AndroidDiagnostic | null>(null);
  const [variant, setVariant] = useState<WhatsAppVariant>("personal");
  const [progress, setProgress] = useState<TransferProgress>(idle);
  const [running, setRunning] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [result, setResult] = useState("");

  const refresh = async () => {
    try {
      const nextDevice = await backend.detectDevice();
      setDevice(nextDevice);

      if (nextDevice?.state === "connected") {
        setDiagnostic({
          code: "connected",
          adbAvailable: true,
          adbServerRunning: true,
          adbPath: "",
          windowsUsbSeen: true
        });
      } else {
        setDiagnostic(await backend.diagnoseConnection());
      }
    } catch {
      setDevice(null);
      try {
        setDiagnostic(await backend.diagnoseConnection());
      } catch {
        setDiagnostic(null);
      }
    }
  };

  async function repairConnection() {
    setRepairing(true);
    setResult("");

    try {
      const nextDiagnostic = await backend.repairConnection();
      setDiagnostic(nextDiagnostic);
      const nextDevice = await backend.detectDevice();
      setDevice(nextDevice);
    } catch (error) {
      setResult(translateBackendError(error));
    } finally {
      setRepairing(false);
    }
  }

  useEffect(() => {
    document.documentElement.lang = "ar";
    document.documentElement.dir = "rtl";

    refresh();
    const timer = window.setInterval(refresh, 2000);
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
      title: ar.saveBackupTitle,
      defaultPath: `H-TRANS_${device?.model || "Android"}_${variant}.htrans`,
      filters: [{ name: ar.backupFileType, extensions: ["htrans"] }]
    });

    if (!destination) return;

    setRunning(true);
    setResult("");
    setProgress({ operation: "backup", percent: 0, stage: "Starting backup" });

    try {
      const saved = await backend.backupWhatsApp(variant, destination);
      setResult(`${ar.backupSaved}: ${saved}`);
    } catch (error) {
      setResult(`${ar.backupFailed}: ${translateBackendError(error)}`);
    } finally {
      setRunning(false);
    }
  }

  async function doRestore() {
    const selected = await open({
      title: ar.selectBackupTitle,
      multiple: false,
      filters: [{ name: ar.backupFileType, extensions: ["htrans"] }]
    });

    if (!selected || Array.isArray(selected)) return;

    try {
      const summary = await backend.inspectBackup(selected);
      const sizeMb = (summary.totalBytes / 1024 / 1024).toFixed(1);
      const approved = await confirm(
        [
          `تحتوي النسخة على ${summary.databaseCount} ملفًا لقاعدة المحادثات بحجم ${sizeMb} ميجابايت.`,
          "",
          ar.restoreVerifyNotice,
          ar.restoreSafetyNotice,
          ar.restoreMediaNotice,
          "",
          ar.restoreContinue
        ].join("\n"),
        { title: ar.restoreDialogTitle, kind: "warning" }
      );

      if (!approved) return;
    } catch (error) {
      setResult(`${ar.cannotOpenBackup}: ${translateBackendError(error)}`);
      return;
    }

    setRunning(true);
    setResult("");
    setProgress({ operation: "restore", percent: 0, stage: "Starting restore" });

    try {
      const outcome = await backend.restoreWhatsApp(selected, variant);
      const safety = outcome.safetyBackup
        ? ` — ${ar.safetyBackup}: ${outcome.safetyBackup}`
        : ` — ${ar.noSafetyNeeded}`;

      setResult(
        `${ar.restoredFiles}: ${outcome.restoredFiles}.${safety} ${ar.finishWhatsAppSetup}`
      );
    } catch (error) {
      setResult(`${ar.restoreFailed}: ${translateBackendError(error)}`);
    } finally {
      setRunning(false);
      refresh();
    }
  }

  const statusText =
    device?.state === "unauthorized"
      ? ar.unauthorized
      : device?.state === "offline"
        ? ar.offline
        : connected
          ? ar.connected
          : ar.waiting;

  const diagnosticCopy = diagnostic ? diagnosticText(diagnostic.code) : null;
  const progressStage = translateStage(progress.stage);
  const progressDetail =
    translateDetail(progress.detail) || (running ? ar.doNotDisconnect : ar.ready);

  return (
    <main className="shell">
      <header>
        <div className="brand">
          <img src={iconUrl} alt={ar.appName} />
          <div>
            <strong>{ar.appName}</strong>
            <span>{ar.tagline}</span>
          </div>
        </div>

        <button className="ghost" onClick={refresh} disabled={running || repairing}>
          <RefreshCw size={16} />
          {ar.refresh}
        </button>
      </header>

      <section className="grid">
        <article className="panel device">
          <div className="heading">
            <div>
              <p className="eyebrow">{ar.connectedDevice}</p>
              <h1>{connected ? ar.phoneDetected : ar.connectPhone}</h1>
            </div>
            <span className={connected ? "status on" : "status"}>{statusText}</span>
          </div>

          <div className="stage">
            <div className="phone">
              <div className="screen">
                {connected ? (
                  <>
                    <Smartphone size={40} />
                    <strong>{device?.model}</strong>
                    <span>{device?.manufacturer}</span>
                    <small>Android {device?.androidVersion}</small>
                  </>
                ) : (
                  <>
                    <WifiOff size={38} />
                    <strong>
                      {device?.state === "unauthorized"
                        ? ar.authorizationRequired
                        : diagnosticCopy?.title || ar.noPhone}
                    </strong>
                    <small>
                      {device?.state === "unauthorized"
                        ? ar.usbAuthorizeHelp
                        : diagnosticCopy?.detail || ar.usbHelp}
                    </small>
                  </>
                )}
              </div>
            </div>

            <div className="facts">
              {connected ? (
                <>
                  <Fact label={ar.serial} value={device?.serial || "—"} />
                  <Fact
                    label={ar.battery}
                    value={device?.batteryLevel != null ? `${device.batteryLevel}٪` : "—"}
                  />
                  <Fact label={ar.storage} value={device?.storageSummary || "—"} />
                  <Fact label={ar.mediaPolicy} value={ar.alwaysExcluded} />
                </>
              ) : (
                <div className="connection-card">
                  <div className="connection-title">
                    <Cable size={20} />
                    <div>
                      <span>{ar.connectionCheck}</span>
                      <strong>{diagnosticCopy?.title || ar.waiting}</strong>
                    </div>
                  </div>

                  <p>{diagnosticCopy?.detail || ar.usbHelp}</p>

                  {diagnostic?.windowsDeviceName && (
                    <div className="detected-usb">
                      <span>{ar.usbDetected}</span>
                      <strong dir="auto">{diagnostic.windowsDeviceName}</strong>
                    </div>
                  )}

                  <div className="diagnostic-flags">
                    <span className={diagnostic?.adbAvailable ? "ok" : ""}>
                      ADB {diagnostic?.adbAvailable ? "✓" : "×"}
                    </span>
                    <span className={diagnostic?.windowsUsbSeen ? "ok" : ""}>
                      USB {diagnostic?.windowsUsbSeen ? "✓" : "×"}
                    </span>
                  </div>

                  <button
                    className="repair"
                    onClick={repairConnection}
                    disabled={repairing || running}
                  >
                    <Wrench size={17} />
                    {repairing ? ar.repairingConnection : ar.repairConnection}
                  </button>
                </div>
              )}
            </div>
          </div>
        </article>

        <article className="panel actions">
          <p className="eyebrow">{ar.selectData}</p>
          <h2>{ar.whatsappChats}</h2>
          <p className="muted">{ar.chatsOnlyDescription}</p>

          <div className="choices">
            <Choice
              active={variant === "personal"}
              title={ar.whatsapp}
              sub={device?.whatsappInstalled ? ar.detected : ar.notDetected}
              onClick={() => setVariant("personal")}
            />
            <Choice
              active={variant === "business"}
              title={ar.whatsappBusiness}
              sub={device?.whatsappBusinessInstalled ? ar.detected : ar.notDetected}
              onClick={() => setVariant("business")}
            />
          </div>

          <div className="privacy">
            <ShieldCheck size={19} />
            <span>{ar.localOnly}</span>
          </div>

          <div className="buttons">
            <button
              className="primary"
              disabled={!connected || !backupSupported || running}
              onClick={doBackup}
            >
              <HardDriveDownload size={18} />
              {ar.backup}
            </button>

            <button
              className="secondary"
              disabled={!connected || running}
              onClick={doRestore}
            >
              <ArchiveRestore size={18} />
              {ar.restore}
            </button>
          </div>

          <div className="progress">
            <div className="progress-head">
              <span>{progressStage}</span>
              <strong>{progress.percent}٪</strong>
            </div>
            <div className="track">
              <i style={{ width: `${progress.percent}%` }} />
            </div>
            <small>{progressDetail}</small>
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
      <strong dir="auto">{value}</strong>
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
