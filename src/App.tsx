import { useEffect, useMemo, useRef, useState } from "react";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import {
  ArchiveRestore,
  Check,
  Download,
  HardDriveDownload,
  Link,
  RefreshCw,
  Smartphone,
  Wifi
} from "lucide-react";
import iconUrl from "./assets/h-trans-icon.svg";
import { ar, translateBackendError, translateDetail, translateStage } from "./i18n/ar";
import { backend } from "./lib/backend";
import type {
  AndroidDevice,
  AndroidDiagnostic,
  MirrorFrame,
  MirrorStatus,
  TransferProgress,
  UpdateInfo,
  UpdateProgress,
  WhatsAppReadProbe,
  WhatsAppVariant
} from "./types";

type Page = "backup" | "restore";
const idle: TransferProgress = { operation: "backup", percent: 0, stage: "Ready" };
const preview = new URLSearchParams(window.location.search).get("preview");
const previewConnected = preview === "connected" || preview === "update";

function formatBytes(bytes: number) {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return mb.toFixed(mb >= 100 ? 0 : 1) + " MB";
  return (mb / 1024).toFixed(2) + " GB";
}

function previewDevice(): AndroidDevice | null {
  if (previewConnected) {
    return {
      serial: "PREVIEW",
      state: "connected",
      manufacturer: "HONOR",
      model: "HONOR 200",
      androidVersion: "15",
      batteryLevel: 84,
      storageSummary: "81 GB / 256 GB",
      whatsappInstalled: true,
      whatsappBusinessInstalled: true
    };
  }

  if (preview === "usb") {
    return {
      serial: "",
      state: "usb_only",
      manufacturer: "HONOR",
      model: "HONOR 200",
      androidVersion: "",
      whatsappInstalled: false,
      whatsappBusinessInstalled: false
    };
  }

  return null;
}

function previewRead(variant: WhatsAppVariant): WhatsAppReadProbe {
  return {
    variant,
    installed: true,
    readable: true,
    databaseFiles: 1,
    currentBytes: variant === "personal" ? 238_000_000 : 91_000_000,
    chatCount: null
  };
}

export default function App() {
  const [page, setPage] = useState<Page>("backup");
  const [device, setDevice] = useState<AndroidDevice | null>(previewDevice());
  const [diagnostic, setDiagnostic] = useState<AndroidDiagnostic | null>(
    preview === "usb"
      ? {
          code: "adb_interface_missing",
          adbAvailable: true,
          adbServerRunning: true,
          adbDeviceSeen: false,
          adbInterfaceSeen: false,
          adbPath: "",
          windowsUsbSeen: true,
          windowsDeviceName: "HONOR 200"
        }
      : null
  );
  const [variant, setVariant] = useState<WhatsAppVariant>("personal");
  const [progress, setProgress] = useState<TransferProgress>(idle);
  const [running, setRunning] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [mirrorStarting, setMirrorStarting] = useState(previewConnected);
  const [mirrorReady, setMirrorReady] = useState(previewConnected);
  const [mirrorFrame, setMirrorFrame] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(
    preview === "update" ? { version: "0.8.0", url: "", sha256: "" } : null
  );
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [personalRead, setPersonalRead] = useState<WhatsAppReadProbe | null>(
    previewConnected ? previewRead("personal") : null
  );
  const [businessRead, setBusinessRead] = useState<WhatsAppReadProbe | null>(
    previewConnected ? previewRead("business") : null
  );
  const [readingWhatsApp, setReadingWhatsApp] = useState(false);
  const [showWireless, setShowWireless] = useState(false);
  const [pairEndpoint, setPairEndpoint] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [connectEndpoint, setConnectEndpoint] = useState("");
  const [wirelessBusy, setWirelessBusy] = useState(false);

  const mirrorSession = useRef<number | null>(null);
  const syncBusy = useRef(false);

  const authorized = device?.state === "connected" && !!device.serial;
  const usbSeen = !!device || !!diagnostic?.windowsUsbSeen;

  const selectedRead = variant === "personal" ? personalRead : businessRead;
  const backupSupported = useMemo(
    () => authorized && !!selectedRead?.readable,
    [authorized, selectedRead]
  );

  async function startMirror(serial: string) {
    if (preview) {
      setMirrorReady(true);
      setMirrorStarting(false);
      return;
    }

    setMirrorFrame(null);
    setMirrorReady(false);
    setMirrorStarting(true);

    try {
      const session = await backend.startLiveMirror(serial);
      mirrorSession.current = session;
    } catch (error) {
      setMirrorStarting(false);
      setResult("تعذر تشغيل البث: " + translateBackendError(error));
    }
  }

  async function stopMirror() {
    mirrorSession.current = null;
    setMirrorFrame(null);
    setMirrorReady(false);
    setMirrorStarting(false);
    if (!preview) await backend.stopLiveMirror().catch(() => undefined);
  }

  async function loadWhatsAppReadState() {
    if (preview) return;
    setReadingWhatsApp(true);
    try {
      const [personal, business] = await Promise.all([
        backend.probeWhatsappReadState("personal").catch(() => null),
        backend.probeWhatsappReadState("business").catch(() => null)
      ]);
      setPersonalRead(personal);
      setBusinessRead(business);
    } finally {
      setReadingWhatsApp(false);
    }
  }

  async function acceptConnectedDevice(nextDevice: AndroidDevice) {
    const changed = device?.serial !== nextDevice.serial;
    setDevice(nextDevice);
    setDiagnostic((current) =>
      current
        ? { ...current, code: "connected", adbDeviceSeen: true, adbInterfaceSeen: true }
        : current
    );

    loadWhatsAppReadState();
    if (changed || !mirrorReady) startMirror(nextDevice.serial);
  }

  async function loadAuthorizedPhone() {
    if (syncBusy.current) return;
    syncBusy.current = true;

    try {
      const nextDevice = await backend.detectDevice();
      if (nextDevice?.state === "connected" && nextDevice.serial) {
        await acceptConnectedDevice(nextDevice);
      }
    } finally {
      syncBusy.current = false;
    }
  }

  async function scanPhone() {
    if (preview || scanning) return;

    setScanning(true);
    setResult("");

    try {
      await stopMirror();
      const nextDiagnostic = await backend.repairConnection();
      setDiagnostic(nextDiagnostic);

      const nextDevice = await backend.detectDevice();
      setDevice(nextDevice);

      if (nextDevice?.state === "connected" && nextDevice.serial) {
        await acceptConnectedDevice(nextDevice);
      } else {
        setPersonalRead(null);
        setBusinessRead(null);
      }
    } catch (error) {
      setDevice(null);
      setPersonalRead(null);
      setBusinessRead(null);
      setResult(translateBackendError(error));
    } finally {
      setScanning(false);
    }
  }

  async function pairWireless() {
    if (!pairEndpoint.trim() || !pairCode.trim() || wirelessBusy) return;
    setWirelessBusy(true);
    setResult("");
    try {
      await backend.pairWireless(pairEndpoint.trim(), pairCode.trim());
      setResult("تم الاقتران. أدخل عنوان الاتصال الظاهر في شاشة التصحيح اللاسلكي.");
    } catch (error) {
      setResult("فشل الاقتران: " + translateBackendError(error));
    } finally {
      setWirelessBusy(false);
    }
  }

  async function connectWireless() {
    if (!connectEndpoint.trim() || wirelessBusy) return;
    setWirelessBusy(true);
    setResult("");
    try {
      await backend.connectWireless(connectEndpoint.trim());
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      const nextDevice = await backend.detectDevice();
      if (nextDevice?.state === "connected" && nextDevice.serial) {
        await acceptConnectedDevice(nextDevice);
        setShowWireless(false);
      } else {
        setResult("تم الاتصال بالشبكة لكن ADB لم يجهز الهاتف بعد.");
      }
    } catch (error) {
      setResult("فشل الاتصال اللاسلكي: " + translateBackendError(error));
    } finally {
      setWirelessBusy(false);
    }
  }

  useEffect(() => {
    document.documentElement.lang = "ar";
    document.documentElement.dir = "rtl";

    let unlistenFrame: (() => void) | undefined;
    let unlistenMirrorStatus: (() => void) | undefined;
    let unlistenTransfer: (() => void) | undefined;
    let unlistenUpdate: (() => void) | undefined;

    if (!preview) {
      backend.onMirrorFrame((frame: MirrorFrame) => {
        if (mirrorSession.current !== null && frame.session !== mirrorSession.current) return;
        if (mirrorSession.current === null) mirrorSession.current = frame.session;
        setMirrorFrame(frame.dataUrl);
        setMirrorReady(true);
        setMirrorStarting(false);
      }).then((fn) => (unlistenFrame = fn)).catch(() => undefined);

      backend.onMirrorStatus((status: MirrorStatus) => {
        if (mirrorSession.current !== null && status.session !== mirrorSession.current) return;

        if (status.state === "starting" || status.state === "connected") {
          setMirrorStarting(true);
        } else if (status.state === "streaming") {
          setMirrorReady(true);
          setMirrorStarting(false);
        } else if (status.state === "error") {
          setMirrorReady(false);
          setMirrorStarting(false);
          setMirrorFrame(null);
          setResult("فشل البث: " + (status.detail || "خطأ غير معروف"));
        } else if (status.state === "stopped") {
          setMirrorReady(false);
          setMirrorStarting(false);
        }
      }).then((fn) => (unlistenMirrorStatus = fn)).catch(() => undefined);
    }

    backend.onProgress(setProgress).then((fn) => (unlistenTransfer = fn)).catch(() => undefined);
    backend.onUpdateProgress(setUpdateProgress).then((fn) => (unlistenUpdate = fn)).catch(() => undefined);

    const watcher = preview ? undefined : window.setInterval(async () => {
      if (scanning || running || syncBusy.current) return;
      try {
        const peer = await backend.peekAdb();
        if (peer?.state === "device") {
          if (!authorized || device?.serial !== peer.serial) await loadAuthorizedPhone();
        } else if (peer?.state === "unauthorized") {
          setDevice((current) => ({
            serial: peer.serial,
            state: "unauthorized",
            manufacturer: current?.manufacturer || "",
            model: current?.model || "Android",
            androidVersion: "",
            whatsappInstalled: false,
            whatsappBusinessInstalled: false
          }));
        } else if (authorized && !peer) {
          await stopMirror();
          setDevice(null);
          setPersonalRead(null);
          setBusinessRead(null);
        }
      } catch {
        // Silent lightweight ADB watcher.
      }
    }, 2200);

    return () => {
      if (watcher) window.clearInterval(watcher);
      unlistenFrame?.();
      unlistenMirrorStatus?.();
      unlistenTransfer?.();
      unlistenUpdate?.();
      if (!preview) backend.stopLiveMirror().catch(() => undefined);
    };
  }, [authorized, device?.serial, scanning, running]);

  async function checkUpdate() {
    if (preview || checkingUpdate) return;
    setCheckingUpdate(true);
    setResult("");
    try {
      const info = await backend.checkForUpdate();
      setUpdateInfo(info);
      if (!info) setResult("أنت تستخدم أحدث إصدار.");
    } catch (error) {
      setResult("تعذر فحص التحديث: " + translateBackendError(error));
    } finally {
      setCheckingUpdate(false);
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
      setResult("تم حفظ النسخة: " + saved);
      await loadWhatsAppReadState();
    } catch (error) {
      setResult("فشل النسخ: " + translateBackendError(error));
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
      const approved = await confirm(
        "استعادة " + summary.databaseCount + " ملف قاعدة محادثات إلى الهاتف؟",
        { title: "تأكيد الاستعادة", kind: "warning" }
      );
      if (!approved) return;
    } catch (error) {
      setResult("تعذر فتح النسخة: " + translateBackendError(error));
      return;
    }

    setRunning(true);
    setResult("");
    setProgress({ operation: "restore", percent: 0, stage: "Starting restore" });

    try {
      const outcome = await backend.restoreWhatsApp(selected, variant);
      setResult("تمت استعادة " + outcome.restoredFiles + " ملف قاعدة محادثات.");
      await loadWhatsAppReadState();
    } catch (error) {
      setResult("فشلت الاستعادة: " + translateBackendError(error));
    } finally {
      setRunning(false);
    }
  }

  const statusText = authorized
    ? "متصل"
    : device?.state === "unauthorized"
      ? "بانتظار موافقتك"
      : usbSeen
        ? "USB فقط"
        : "غير متصل";

  const connectionHint = device?.state === "unauthorized"
    ? "افتح الهاتف واضغط سماح لرسالة تصحيح USB."
    : diagnostic?.code === "adb_interface_missing"
      ? "من الهاتف: خيارات المطور ← تصحيح USB."
      : diagnostic?.code === "adb_interface_not_ready"
        ? "افتح الهاتف ووافق على بصمة RSA."
        : usbSeen
          ? "USB يعمل، لكن Android لم يفتح ADB."
          : "وصّل الهاتف بكابل بيانات.";

  function readLabel(read: WhatsAppReadProbe | null, installed?: boolean) {
    if (read?.chatCount != null) return read.chatCount + " محادثة";
    if (read?.readable) {
      return "تمت القراءة • " + read.databaseFiles + " ملف • " + formatBytes(read.currentBytes);
    }
    if (readingWhatsApp) return "جارٍ قراءة البيانات...";
    if (authorized && installed === false) return "غير مثبت";
    if (authorized) return "لا توجد نسخة محلية";
    return "بانتظار الاتصال";
  }

  const personalReadLabel = readLabel(personalRead, device?.whatsappInstalled);
  const businessReadLabel = readLabel(businessRead, device?.whatsappBusinessInstalled);
  const actionDisabled = running || (page === "backup" ? !backupSupported : !authorized);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo-block">
          <img src={iconUrl} alt="H TRANS" />
          <div>
            <strong>H TRANS</strong>
            <span>WhatsApp Transfer</span>
          </div>
        </div>

        <nav>
          <button className={page === "backup" ? "nav active" : "nav"} onClick={() => setPage("backup")}>
            <HardDriveDownload size={20} />
            نسخ احتياطي
          </button>
          <button className={page === "restore" ? "nav active" : "nav"} onClick={() => setPage("restore")}>
            <ArchiveRestore size={20} />
            استعادة
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button className="update-link" onClick={updateInfo ? installUpdate : checkUpdate} disabled={checkingUpdate || updating}>
            <Download size={17} />
            {updateInfo
              ? updating
                ? "التحديث " + (updateProgress?.percent ?? 0) + "٪"
                : "تحديث " + updateInfo.version
              : checkingUpdate
                ? "جارٍ الفحص..."
                : "فحص التحديث"}
          </button>
          <small>الإصدار 0.7.1</small>
        </div>
      </aside>

      <main className="main">
        <header className="main-header">
          <div>
            <span className="section-label">H TRANS</span>
            <h1>{page === "backup" ? "نسخ محادثات واتساب" : "استعادة المحادثات"}</h1>
          </div>

          <div className="header-actions">
            <span className={authorized ? "status connected" : usbSeen ? "status usb" : "status"}>
              <i />
              {statusText}
            </span>
            <button className="scan-button" onClick={scanPhone} disabled={scanning || running}>
              <RefreshCw size={17} className={scanning ? "spin" : ""} />
              {scanning ? "جارٍ الفحص" : "فحص الهاتف"}
            </button>
          </div>
        </header>

        <section className="workspace">
          <div className="mirror-panel">
            <div className="mirror-head">
              <div>
                <span>شاشة الهاتف</span>
                <strong>{device?.model || "Android"}</strong>
              </div>
              <div className={mirrorReady ? "live-badge on" : "live-badge"}>
                <i />
                {mirrorReady ? "LIVE" : mirrorStarting ? "جارٍ بدء البث" : authorized ? "جاهز للبث" : "متوقف"}
              </div>
            </div>

            <div className="phone-stage">
              <div className="device-frame">
                <div className="device-speaker" />
                <div className="native-mirror-surface">
                  {mirrorFrame ? (
                    <img className="mirror-image" src={mirrorFrame} alt="شاشة الهاتف المباشرة" />
                  ) : previewConnected ? (
                    <div className="demo-live">
                      <Smartphone size={56} />
                      <strong>البث المباشر</strong>
                      <span>ستظهر شاشة الهاتف الفعلية هنا</span>
                    </div>
                  ) : (
                    <div className="mirror-placeholder">
                      <Smartphone size={56} />
                      <strong>{authorized ? "جارٍ انتظار أول إطار" : statusText}</strong>
                      <span>{authorized ? "H TRANS يجهز بث الشاشة داخل التطبيق" : connectionHint}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="device-info">
              {authorized && <span>Android {device?.androidVersion}</span>}
              {device?.batteryLevel != null && <span>{device.batteryLevel}٪ بطارية</span>}
              {device?.storageSummary && <span>{device.storageSummary}</span>}
            </div>
          </div>

          <aside className="control-panel">
            {!authorized && (
              <div className="connection-card">
                <div className="connection-title">
                  <Link size={17} />
                  <strong>اتصال Android</strong>
                </div>
                <p>{connectionHint}</p>

                <div className="connection-actions">
                  <button onClick={scanPhone} disabled={scanning}>
                    <RefreshCw size={15} />
                    إعادة الفحص
                  </button>
                  <button onClick={() => setShowWireless((value) => !value)}>
                    <Wifi size={15} />
                    اتصال لاسلكي
                  </button>
                </div>

                {showWireless && (
                  <div className="wireless-box">
                    <div className="field-row">
                      <input
                        value={pairEndpoint}
                        onChange={(event) => setPairEndpoint(event.target.value)}
                        placeholder="عنوان الاقتران IP:PORT"
                        dir="ltr"
                      />
                      <input
                        value={pairCode}
                        onChange={(event) => setPairCode(event.target.value)}
                        placeholder="رمز الاقتران"
                        dir="ltr"
                      />
                      <button onClick={pairWireless} disabled={wirelessBusy}>اقتران</button>
                    </div>
                    <div className="field-row connect-row">
                      <input
                        value={connectEndpoint}
                        onChange={(event) => setConnectEndpoint(event.target.value)}
                        placeholder="عنوان الاتصال IP:PORT"
                        dir="ltr"
                      />
                      <button onClick={connectWireless} disabled={wirelessBusy}>اتصال</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <span className="control-kicker">البيانات</span>
            <h2>واتساب</h2>

            <button className={variant === "personal" ? "variant active" : "variant"} onClick={() => setVariant("personal")}>
              <span className="variant-check">{variant === "personal" ? <Check size={16} /> : null}</span>
              <div>
                <div className="variant-title-line">
                  <strong>واتساب</strong>
                  {personalRead?.readable && <em>مقروء</em>}
                </div>
                <small>{personalReadLabel}</small>
              </div>
            </button>

            <button className={variant === "business" ? "variant active" : "variant"} onClick={() => setVariant("business")}>
              <span className="variant-check">{variant === "business" ? <Check size={16} /> : null}</span>
              <div>
                <div className="variant-title-line">
                  <strong>واتساب للأعمال</strong>
                  {businessRead?.readable && <em>مقروء</em>}
                </div>
                <small>{businessReadLabel}</small>
              </div>
            </button>

            <div className="simple-note">المحادثات فقط — بدون وسائط</div>

            <button className="primary action" disabled={actionDisabled} onClick={page === "backup" ? doBackup : doRestore}>
              {page === "backup" ? <HardDriveDownload size={20} /> : <ArchiveRestore size={20} />}
              {running
                ? "جارٍ التنفيذ..."
                : page === "backup"
                  ? "بدء النسخ الاحتياطي"
                  : "اختيار النسخة واستعادتها"}
            </button>

            <div className="progress-card">
              <div className="progress-copy">
                <strong>{translateStage(progress.stage)}</strong>
                <span>{translateDetail(progress.detail) || (running ? "لا تفصل الهاتف" : "جاهز")}</span>
              </div>
              <div className="progress-row">
                <div className="progress-track"><i style={{ width: progress.percent + "%" }} /></div>
                <b>{progress.percent}٪</b>
              </div>
            </div>
          </aside>
        </section>

        {result && <div className="toast-result">{result}</div>}
      </main>
    </div>
  );
}
