import { useEffect, useMemo, useRef, useState } from "react";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import {
  ArchiveRestore,
  Check,
  Download,
  HardDriveDownload,
  Maximize2,
  RefreshCw,
  Smartphone
} from "lucide-react";
import iconUrl from "./assets/h-trans-icon.svg";
import { ar, translateBackendError, translateDetail, translateStage } from "./i18n/ar";
import { backend } from "./lib/backend";
import type {
  AndroidDevice,
  AndroidDiagnostic,
  TransferProgress,
  UpdateInfo,
  UpdateProgress,
  WhatsAppVariant
} from "./types";

type Page = "backup" | "restore";
const idle: TransferProgress = { operation: "backup", percent: 0, stage: "Ready" };
const preview = new URLSearchParams(window.location.search).get("preview");

function demoDevice(): AndroidDevice {
  return {
    serial: "PREVIEW",
    state: "connected",
    manufacturer: "HONOR",
    model: "HONOR 200",
    androidVersion: "15",
    batteryLevel: 84,
    storageSummary: "81 GB / 256 GB",
    whatsappInstalled: true,
    whatsappBusinessInstalled: false
  };
}

export default function App() {
  const [page, setPage] = useState<Page>("backup");
  const [device, setDevice] = useState<AndroidDevice | null>(preview ? demoDevice() : null);
  const [diagnostic, setDiagnostic] = useState<AndroidDiagnostic | null>(null);
  const [variant, setVariant] = useState<WhatsAppVariant>("personal");
  const [progress, setProgress] = useState<TransferProgress>(idle);
  const [running, setRunning] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [mirrorStarting, setMirrorStarting] = useState(false);
  const [mirrorReady, setMirrorReady] = useState(!!preview);
  const [result, setResult] = useState("");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(
    preview === "update" ? { version: "0.7.0", url: "", sha256: "" } : null
  );
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);

  const mirrorRef = useRef<HTMLDivElement>(null);
  const authorized = device?.state === "connected" && !!device.serial;
  const usbOnly = device?.state === "usb_only";

  const backupSupported = useMemo(
    () =>
      authorized &&
      (variant === "personal" ? device?.whatsappInstalled : device?.whatsappBusinessInstalled),
    [authorized, device, variant]
  );

  function currentMirrorRect() {
    const element = mirrorRef.current;
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;

    return {
      x: Math.round(rect.left * scale),
      y: Math.round(rect.top * scale),
      width: Math.max(1, Math.round(rect.width * scale)),
      height: Math.max(1, Math.round(rect.height * scale))
    };
  }

  async function startMirror(serial: string) {
    if (preview) {
      setMirrorReady(true);
      return;
    }

    const rect = currentMirrorRect();
    if (!rect) return;

    setMirrorStarting(true);
    setMirrorReady(false);

    try {
      await backend.startLiveMirror(serial, rect);
      setMirrorReady(true);
    } catch (error) {
      setMirrorReady(false);
      setResult("تعذر تشغيل البث المباشر: " + translateBackendError(error));
    } finally {
      setMirrorStarting(false);
    }
  }

  async function scanPhone() {
    if (preview) return;

    setScanning(true);
    setResult("");

    try {
      await backend.stopLiveMirror().catch(() => undefined);
      setMirrorReady(false);

      const nextDiagnostic = await backend.repairConnection();
      setDiagnostic(nextDiagnostic);

      if (
        nextDiagnostic.code === "connected" ||
        nextDiagnostic.code === "unauthorized" ||
        nextDiagnostic.code === "offline"
      ) {
        const nextDevice = await backend.detectDevice();
        setDevice(nextDevice);

        if (nextDevice?.state === "connected" && nextDevice.serial) {
          window.setTimeout(() => startMirror(nextDevice.serial), 80);
        }
      } else if (nextDiagnostic.windowsUsbSeen) {
        setDevice({
          serial: "",
          state: "usb_only",
          manufacturer: "",
          model: nextDiagnostic.windowsDeviceName || "Android",
          androidVersion: "",
          whatsappInstalled: false,
          whatsappBusinessInstalled: false
        });
      } else {
        setDevice(null);
      }
    } catch (error) {
      setDevice(null);
      setResult(translateBackendError(error));
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    document.documentElement.lang = "ar";
    document.documentElement.dir = "rtl";

    let unlistenTransfer: (() => void) | undefined;
    let unlistenUpdate: (() => void) | undefined;

    backend.onProgress(setProgress).then((fn) => (unlistenTransfer = fn)).catch(() => undefined);
    backend.onUpdateProgress(setUpdateProgress).then((fn) => (unlistenUpdate = fn)).catch(() => undefined);

    return () => {
      unlistenTransfer?.();
      unlistenUpdate?.();
      if (!preview) backend.stopLiveMirror().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!authorized || preview || !mirrorReady) return;

    const resize = () => {
      const rect = currentMirrorRect();
      if (rect) backend.resizeLiveMirror(rect).catch(() => undefined);
    };

    const observer = new ResizeObserver(resize);
    if (mirrorRef.current) observer.observe(mirrorRef.current);
    window.addEventListener("resize", resize);

    const timer = window.setTimeout(resize, 100);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [authorized, mirrorReady, page]);

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
        "استعادة " + summary.databaseCount + " ملف محادثات إلى الهاتف؟",
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
      setResult("تمت استعادة " + outcome.restoredFiles + " ملف محادثات.");
    } catch (error) {
      setResult("فشلت الاستعادة: " + translateBackendError(error));
    } finally {
      setRunning(false);
    }
  }

  const statusText = authorized
    ? "متصل"
    : device?.state === "unauthorized"
      ? "وافق من الهاتف"
      : usbOnly
        ? "فعّل تصحيح USB"
        : device?.state === "offline"
          ? "غير جاهز"
          : "غير متصل";

  const actionDisabled =
    running || (page === "backup" ? !backupSupported : !authorized);

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
          <button
            className="update-link"
            onClick={updateInfo ? installUpdate : checkUpdate}
            disabled={checkingUpdate || updating}
          >
            <Download size={17} />
            {updateInfo
              ? updating
                ? "التحديث " + (updateProgress?.percent ?? 0) + "٪"
                : "تحديث " + updateInfo.version
              : checkingUpdate
                ? "جارٍ الفحص..."
                : "فحص التحديث"}
          </button>
          <small>الإصدار 0.6.0</small>
        </div>
      </aside>

      <main className="main">
        <header className="main-header">
          <div>
            <span className="section-label">H TRANS</span>
            <h1>{page === "backup" ? "نسخ محادثات واتساب" : "استعادة المحادثات"}</h1>
          </div>

          <div className="header-actions">
            <span className={authorized ? "status connected" : usbOnly ? "status usb" : "status"}>
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
                <span>البث المباشر</span>
                <strong>{device?.model || "هاتف Android"}</strong>
              </div>
              <div className={mirrorReady ? "live-badge on" : "live-badge"}>
                <i />
                {mirrorReady ? "LIVE" : mirrorStarting ? "جارٍ التشغيل" : "متوقف"}
              </div>
            </div>

            <div className="device-frame">
              <div className="device-speaker" />
              <div ref={mirrorRef} className="native-mirror-surface">
                {!mirrorReady && (
                  <div className="mirror-placeholder">
                    <Smartphone size={66} />
                    <strong>{statusText}</strong>
                    <span>
                      {authorized
                        ? "جارٍ تجهيز البث المباشر"
                        : usbOnly
                          ? "فعّل تصحيح USB ثم اضغط فحص الهاتف"
                          : "وصّل الهاتف واضغط فحص الهاتف"}
                    </span>
                  </div>
                )}
                {preview && mirrorReady && (
                  <div className="demo-live">
                    <Maximize2 size={30} />
                    <strong>معاينة البث المباشر</strong>
                    <span>ستظهر شاشة هاتفك الحقيقية هنا</span>
                  </div>
                )}
              </div>
            </div>

            <div className="device-info">
              <span>{authorized ? "Android " + device?.androidVersion : statusText}</span>
              {device?.batteryLevel != null && <span>{device.batteryLevel}٪ بطارية</span>}
            </div>
          </div>

          <aside className="control-panel">
            <span className="control-kicker">البيانات</span>
            <h2>واتساب</h2>

            <button
              className={variant === "personal" ? "variant active" : "variant"}
              onClick={() => setVariant("personal")}
            >
              <span className="variant-check">{variant === "personal" ? <Check size={16} /> : null}</span>
              <div>
                <strong>واتساب</strong>
                <small>{authorized ? (device?.whatsappInstalled ? "جاهز" : "غير مثبت") : "بانتظار الهاتف"}</small>
              </div>
            </button>

            <button
              className={variant === "business" ? "variant active" : "variant"}
              onClick={() => setVariant("business")}
            >
              <span className="variant-check">{variant === "business" ? <Check size={16} /> : null}</span>
              <div>
                <strong>واتساب للأعمال</strong>
                <small>{authorized ? (device?.whatsappBusinessInstalled ? "جاهز" : "غير مثبت") : "بانتظار الهاتف"}</small>
              </div>
            </button>

            <div className="simple-note">المحادثات فقط — بدون وسائط</div>

            <button
              className="primary action"
              disabled={actionDisabled}
              onClick={page === "backup" ? doBackup : doRestore}
            >
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
                <div className="progress-track">
                  <i style={{ width: progress.percent + "%" }} />
                </div>
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
