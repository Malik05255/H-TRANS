import { useEffect, useMemo, useState } from "react";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import {
  ArchiveRestore,
  Cable,
  Check,
  CheckCircle2,
  Download,
  HardDriveDownload,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Unplug,
  Wifi,
  X
} from "lucide-react";
import iconUrl from "./assets/h-trans-icon.svg";
import { ar, diagnosticText, translateBackendError, translateDetail, translateStage } from "./i18n/ar";
import { backend } from "./lib/backend";
import type {
  AndroidDevice,
  AndroidDiagnostic,
  TransferProgress,
  UpdateInfo,
  UpdateProgress,
  WhatsAppVariant
} from "./types";

const idleProgress: TransferProgress = { operation: "backup", percent: 0, stage: "Ready" };
const preview = new URLSearchParams(window.location.search).get("preview");

function previewState() {
  if (preview === "connected") {
    const device: AndroidDevice = {
      serial: "HTRANS-PREVIEW",
      state: "connected",
      manufacturer: "HONOR",
      model: "HONOR 200",
      androidVersion: "15",
      batteryLevel: 84,
      storageSummary: "81 GB مستخدم / 256 GB إجمالي",
      whatsappInstalled: true,
      whatsappBusinessInstalled: false
    };
    const diagnostic: AndroidDiagnostic = {
      code: "connected",
      adbAvailable: true,
      adbServerRunning: true,
      adbDeviceSeen: true,
      adbInterfaceSeen: true,
      adbPath: "",
      windowsUsbSeen: true,
      windowsDeviceName: "HONOR 200"
    };
    return { device, diagnostic };
  }

  const device: AndroidDevice = {
    serial: "",
    state: "usb_only",
    manufacturer: "HONOR",
    model: "HONOR 200",
    androidVersion: "",
    whatsappInstalled: false,
    whatsappBusinessInstalled: false
  };
  const diagnostic: AndroidDiagnostic = {
    code: "usb_seen_no_adb",
    adbAvailable: true,
    adbServerRunning: true,
    adbDeviceSeen: false,
    adbInterfaceSeen: true,
    adbPath: "",
    windowsUsbSeen: true,
    windowsDeviceName: "HONOR 200"
  };
  return { device, diagnostic };
}

export default function App() {
  const [device, setDevice] = useState<AndroidDevice | null>(null);
  const [diagnostic, setDiagnostic] = useState<AndroidDiagnostic | null>(null);
  const [variant, setVariant] = useState<WhatsAppVariant>("personal");
  const [progress, setProgress] = useState<TransferProgress>(idleProgress);
  const [running, setRunning] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [result, setResult] = useState("");
  const [wirelessOpen, setWirelessOpen] = useState(false);
  const [pairEndpoint, setPairEndpoint] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [connectEndpoint, setConnectEndpoint] = useState("");
  const [wirelessMessage, setWirelessMessage] = useState("");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(
    preview === "update" ? { version: "0.5.0", url: "", sha256: "" } : null
  );
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [updating, setUpdating] = useState(false);

  const refresh = async () => {
    if (preview) {
      const state = previewState();
      setDevice(state.device);
      setDiagnostic(state.diagnostic);
      return;
    }

    try {
      const values = await Promise.all([backend.detectDevice(), backend.diagnoseConnection()]);
      setDevice(values[0]);
      setDiagnostic(values[1]);
    } catch {
      setDevice(null);
      setDiagnostic(null);
    }
  };

  useEffect(() => {
    document.documentElement.lang = "ar";
    document.documentElement.dir = "rtl";
    refresh();

    if (!preview) {
      backend.checkForUpdate().then(setUpdateInfo).catch(() => undefined);
    }

    const timer = preview ? undefined : window.setInterval(refresh, 3000);
    let unlistenTransfer: (() => void) | undefined;
    let unlistenUpdate: (() => void) | undefined;

    backend.onProgress(setProgress).then((fn) => (unlistenTransfer = fn)).catch(() => undefined);
    backend.onUpdateProgress(setUpdateProgress).then((fn) => (unlistenUpdate = fn)).catch(() => undefined);

    return () => {
      if (timer) window.clearInterval(timer);
      unlistenTransfer?.();
      unlistenUpdate?.();
    };
  }, []);

  const connected = device?.state === "connected";
  const usbOnly = device?.state === "usb_only";
  const diagnosticCopy = diagnostic ? diagnosticText(diagnostic.code) : null;

  const backupSupported = useMemo(
    () => connected && !!device && (variant === "personal" ? device.whatsappInstalled : device.whatsappBusinessInstalled),
    [connected, device, variant]
  );

  async function repairConnection() {
    if (preview) return;
    setRepairing(true);
    setWirelessMessage("");
    try {
      setDiagnostic(await backend.repairConnection());
      setDevice(await backend.detectDevice());
    } catch (error) {
      setResult(translateBackendError(error));
    } finally {
      setRepairing(false);
    }
  }

  async function pairWireless() {
    setWirelessMessage("");
    try {
      const message = await backend.pairWireless(pairEndpoint.trim(), pairCode.trim());
      setWirelessMessage(ar.pairSuccess + ": " + message);
    } catch (error) {
      setWirelessMessage(translateBackendError(error));
    }
  }

  async function connectWireless() {
    setWirelessMessage("");
    try {
      const message = await backend.connectWireless(connectEndpoint.trim());
      setWirelessMessage(ar.connectSuccess + ": " + message);
      await refresh();
    } catch (error) {
      setWirelessMessage(translateBackendError(error));
    }
  }

  async function installUpdate() {
    if (!updateInfo || preview) return;
    setUpdating(true);
    try {
      await backend.installUpdate(updateInfo);
    } catch (error) {
      setUpdating(false);
      setResult("تعذر تثبيت التحديث: " + translateBackendError(error));
    }
  }

  async function doBackup() {
    const destination = await save({
      title: ar.saveBackupTitle,
      defaultPath: "H-TRANS_" + (device?.model || "Android") + "_" + variant + ".htrans",
      filters: [{ name: ar.backupFileType, extensions: ["htrans"] }]
    });
    if (!destination) return;

    setRunning(true);
    setResult("");
    setProgress({ operation: "backup", percent: 0, stage: "Starting backup" });

    try {
      const saved = await backend.backupWhatsApp(variant, destination);
      setResult(ar.backupSaved + ": " + saved);
    } catch (error) {
      setResult(ar.backupFailed + ": " + translateBackendError(error));
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
          "النسخة تحتوي على " + summary.databaseCount + " ملف محادثات بحجم " + sizeMb + " ميجابايت.",
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
      setResult(ar.cannotOpenBackup + ": " + translateBackendError(error));
      return;
    }

    setRunning(true);
    setResult("");
    setProgress({ operation: "restore", percent: 0, stage: "Starting restore" });

    try {
      const outcome = await backend.restoreWhatsApp(selected, variant);
      const safety = outcome.safetyBackup
        ? " — " + ar.safetyBackup + ": " + outcome.safetyBackup
        : " — " + ar.noSafetyNeeded;
      setResult(ar.restoredFiles + ": " + outcome.restoredFiles + "." + safety + " " + ar.finishWhatsAppSetup);
    } catch (error) {
      setResult(ar.restoreFailed + ": " + translateBackendError(error));
    } finally {
      setRunning(false);
      refresh();
    }
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <img src={iconUrl} alt={ar.appName} />
          <div>
            <strong>H TRANS</strong>
            <span>{ar.tagline}</span>
          </div>
        </div>

        <div className="header-actions">
          {updateInfo && (
            <button className="update-button" onClick={installUpdate} disabled={updating}>
              <Download size={18} />
              <span>
                <b>{updating ? ar.updating : ar.updateAvailable}</b>
                <small>{updating && updateProgress ? updateProgress.percent + "٪" : "v" + updateInfo.version}</small>
              </span>
            </button>
          )}
          <span className="version-chip">{ar.version} 0.4.0</span>
        </div>
      </header>

      {!connected ? (
        <section className="connection-screen">
          <div className="connection-head">
            <div>
              <span className="section-kicker">{ar.connectedDevice}</span>
              <h1>{usbOnly ? ar.usbDetected : ar.connectTitle}</h1>
              <p>{usbOnly ? ar.adbRequired : ar.connectSubtitle}</p>
            </div>
            <span className={usbOnly ? "state-pill usb" : "state-pill"}>
              {usbOnly ? "USB متصل" : ar.waiting}
            </span>
          </div>

          <div className="connection-main">
            <div className="device-hero">
              <div className="phone-shell">
                <div className="phone-display">
                  {usbOnly ? <Smartphone size={58} /> : <Unplug size={54} />}
                  <strong>{device?.model || "Android"}</strong>
                  <span>{usbOnly ? "متصل بالكمبيوتر" : "بانتظار الهاتف"}</span>
                </div>
              </div>
            </div>

            <div className="setup-panel">
              <div className="setup-status">
                <StatusItem label={ar.usbLink} ok={!!diagnostic?.windowsUsbSeen} />
                <StatusItem label={ar.adbEngine} ok={!!diagnostic?.adbAvailable && !!diagnostic?.adbServerRunning} />
                <StatusItem label={ar.adbDriver} ok={!!diagnostic?.adbInterfaceSeen} />
                <StatusItem label={ar.adbDevice} ok={!!diagnostic?.adbDeviceSeen && diagnostic?.code === "connected"} />
              </div>

              <div className="diagnostic-box">
                <div className="diagnostic-title">
                  <Cable size={22} />
                  <div>
                    <span>التشخيص</span>
                    <strong>{diagnosticCopy?.title || ar.waiting}</strong>
                  </div>
                </div>
                <p>{diagnosticCopy?.detail || ar.connectSubtitle}</p>
                {diagnosticCopy?.steps && (
                  <div className="steps-grid">
                    {diagnosticCopy.steps.map((step, index) => (
                      <div className="step" key={index}>
                        <b>{index + 1}</b>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {diagnostic?.windowsDeviceName?.toUpperCase().includes("HONOR") && (
                <div className="honor-note">
                  <Smartphone size={20} />
                  <div>
                    <strong>{ar.honorTitle}</strong>
                    <span>{ar.honorText}</span>
                  </div>
                </div>
              )}

              <div className="connection-actions">
                <button className="primary action-wide" onClick={repairConnection} disabled={repairing}>
                  <RefreshCw size={19} />
                  {repairing ? "جارٍ الفحص..." : ar.retryConnection}
                </button>
                <button className="secondary action-wide" onClick={() => setWirelessOpen((value) => !value)}>
                  <Wifi size={19} />
                  {wirelessOpen ? ar.hideWireless : ar.showWireless}
                </button>
              </div>

              {wirelessOpen && (
                <div className="wireless-panel">
                  <div className="wireless-head">
                    <Wifi size={21} />
                    <div>
                      <strong>{ar.wirelessTitle}</strong>
                      <span>{ar.wirelessSubtitle}</span>
                    </div>
                  </div>
                  <div className="wireless-form">
                    <input value={pairEndpoint} onChange={(e) => setPairEndpoint(e.target.value)} placeholder={ar.pairEndpoint} dir="ltr" />
                    <input value={pairCode} onChange={(e) => setPairCode(e.target.value)} placeholder={ar.pairCode} dir="ltr" />
                    <button onClick={pairWireless} disabled={!pairEndpoint || !pairCode}>{ar.pair}</button>
                    <input className="connect-field" value={connectEndpoint} onChange={(e) => setConnectEndpoint(e.target.value)} placeholder={ar.connectEndpoint} dir="ltr" />
                    <button onClick={connectWireless} disabled={!connectEndpoint}>{ar.connect}</button>
                  </div>
                  {wirelessMessage && <p className="wireless-result">{wirelessMessage}</p>}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="dashboard">
          <div className="device-strip">
            <div className="device-id">
              <div className="device-icon"><Smartphone size={25} /></div>
              <div>
                <span>{ar.phoneReady}</span>
                <strong>{device?.model}</strong>
              </div>
            </div>
            <div className="device-meta">
              <span>{"Android " + device?.androidVersion}</span>
              <span>{(device?.batteryLevel ?? "—") + "٪ بطارية"}</span>
              <span>{device?.storageSummary || "التخزين غير متاح"}</span>
            </div>
            <span className="ready-badge"><CheckCircle2 size={16} /> {ar.connectionReady}</span>
          </div>

          <div className="dashboard-grid">
            <article className="action-card">
              <div className="action-icon"><HardDriveDownload size={28} /></div>
              <span className="section-kicker">{ar.backup}</span>
              <h2>{ar.backupTitle}</h2>
              <p>{ar.backupText}</p>

              <div className="variant-selector">
                <VariantButton active={variant === "personal"} title={ar.whatsapp} state={device?.whatsappInstalled ? ar.detected : ar.notDetected} onClick={() => setVariant("personal")} />
                <VariantButton active={variant === "business"} title={ar.whatsappBusiness} state={device?.whatsappBusinessInstalled ? ar.detected : ar.notDetected} onClick={() => setVariant("business")} />
              </div>

              <div className="info-note"><ShieldCheck size={18} /> {ar.chatsOnly} {ar.localOnly}</div>

              <button className="primary big-button" disabled={!backupSupported || running} onClick={doBackup}>
                <HardDriveDownload size={20} /> {ar.backup}
              </button>
            </article>

            <article className="action-card">
              <div className="action-icon"><ArchiveRestore size={28} /></div>
              <span className="section-kicker">{ar.restore}</span>
              <h2>{ar.restoreTitle}</h2>
              <p>{ar.restoreText}</p>
              <div className="restore-points">
                <span><Check size={16} /> فحص سلامة النسخة</span>
                <span><Check size={16} /> نسخة أمان تلقائية</span>
                <span><Check size={16} /> بدون تعديل الوسائط</span>
              </div>
              <button className="secondary big-button" disabled={running} onClick={doRestore}>
                <ArchiveRestore size={20} /> {ar.restore}
              </button>
            </article>
          </div>

          <div className="operation-bar">
            <div className="operation-copy">
              <strong>{translateStage(progress.stage)}</strong>
              <span>{translateDetail(progress.detail) || (running ? ar.doNotDisconnect : ar.ready)}</span>
            </div>
            <div className="operation-progress">
              <div className="progress-line"><i style={{ width: progress.percent + "%" }} /></div>
              <b>{progress.percent + "٪"}</b>
            </div>
          </div>

          {result && <div className="result-banner">{result}</div>}
        </section>
      )}
    </main>
  );
}

function StatusItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={ok ? "status-item ok" : "status-item"}>
      <span className="status-dot">{ok ? <Check size={15} /> : <X size={15} />}</span>
      <span>{label}</span>
    </div>
  );
}

function VariantButton({ active, title, state, onClick }: { active: boolean; title: string; state: string; onClick: () => void }) {
  return (
    <button className={active ? "variant active" : "variant"} onClick={onClick}>
      <span className="variant-check">{active ? <Check size={16} /> : null}</span>
      <span><strong>{title}</strong><small>{state}</small></span>
    </button>
  );
}
