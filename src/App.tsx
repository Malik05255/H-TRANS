import { useEffect, useMemo, useRef, useState } from "react";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import {
  ArchiveRestore,
  ArrowLeftRight,
  Check,
  Download,
  HardDriveDownload,
  Laptop,
  PlugZap,
  RefreshCw,
  RotateCw,
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

type Page = "backup" | "restore" | "connect";
const idle: TransferProgress = { operation: "backup", percent: 0, stage: "Ready" };
const preview = new URLSearchParams(window.location.search).get("preview");

function previewDevice(): { device: AndroidDevice; diagnostic: AndroidDiagnostic } {
  if (preview === "connected") {
    return {
      device: {
        serial: "PREVIEW",
        state: "connected",
        manufacturer: "HONOR",
        model: "HONOR 200",
        androidVersion: "15",
        batteryLevel: 84,
        storageSummary: "81 GB / 256 GB",
        whatsappInstalled: true,
        whatsappBusinessInstalled: false
      },
      diagnostic: {
        code: "connected",
        adbAvailable: true,
        adbServerRunning: true,
        adbDeviceSeen: true,
        adbInterfaceSeen: true,
        adbPath: "",
        windowsUsbSeen: true,
        windowsDeviceName: "HONOR 200"
      }
    };
  }

  return {
    device: {
      serial: "",
      state: "usb_only",
      manufacturer: "",
      model: "HONOR 200",
      androidVersion: "",
      whatsappInstalled: false,
      whatsappBusinessInstalled: false
    },
    diagnostic: {
      code: "usb_seen_no_adb",
      adbAvailable: true,
      adbServerRunning: true,
      adbDeviceSeen: false,
      adbInterfaceSeen: true,
      adbPath: "",
      windowsUsbSeen: true,
      windowsDeviceName: "HONOR 200"
    }
  };
}

export default function App() {
  const [page, setPage] = useState<Page>("backup");
  const [device, setDevice] = useState<AndroidDevice | null>(null);
  const [diagnostic, setDiagnostic] = useState<AndroidDiagnostic | null>(null);
  const [phoneScreen, setPhoneScreen] = useState<string | null>(null);
  const [variant, setVariant] = useState<WhatsAppVariant>("personal");
  const [progress, setProgress] = useState<TransferProgress>(idle);
  const [running, setRunning] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState("");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(
    preview === "update" ? { version: "0.6.0", url: "", sha256: "" } : null
  );
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const screenBusy = useRef(false);

  const connected = device?.state === "connected";
  const usbOnly = device?.state === "usb_only";
  const authorized = connected && !!device?.serial;

  const backupSupported = useMemo(
    () => authorized && (variant === "personal" ? device?.whatsappInstalled : device?.whatsappBusinessInstalled),
    [authorized, device, variant]
  );

  async function capturePhoneScreen(serial = device?.serial) {
    if (!serial || preview || screenBusy.current) return;
    screenBusy.current = true;
    try {
      setPhoneScreen(await backend.captureScreen(serial));
    } catch {
      // Keep the last successful frame.
    } finally {
      screenBusy.current = false;
    }
  }

  async function scanPhone() {
    if (preview) {
      const demo = previewDevice();
      setDevice(demo.device);
      setDiagnostic(demo.diagnostic);
      return;
    }

    setScanning(true);
    setResult("");

    try {
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
          await capturePhoneScreen(nextDevice.serial);
        } else {
          setPhoneScreen(null);
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
        setPhoneScreen(null);
      } else {
        setDevice(null);
        setPhoneScreen(null);
      }
    } catch (error) {
      setDevice(null);
      setPhoneScreen(null);
      setResult(translateBackendError(error));
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    document.documentElement.lang = "ar";
    document.documentElement.dir = "rtl";

    if (preview) {
      const demo = previewDevice();
      setDevice(demo.device);
      setDiagnostic(demo.diagnostic);
    }

    let unlistenTransfer: (() => void) | undefined;
    let unlistenUpdate: (() => void) | undefined;

    backend.onProgress(setProgress).then((fn) => (unlistenTransfer = fn)).catch(() => undefined);
    backend.onUpdateProgress(setUpdateProgress).then((fn) => (unlistenUpdate = fn)).catch(() => undefined);

    return () => {
      unlistenTransfer?.();
      unlistenUpdate?.();
    };
  }, []);

  useEffect(() => {
    if (!authorized || preview) return;
    const timer = window.setInterval(() => capturePhoneScreen(), 6000);
    return () => window.clearInterval(timer);
  }, [device?.serial, authorized]);

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

  const statusText = connected
    ? "متصل"
    : device?.state === "unauthorized"
      ? "وافق من الهاتف"
      : usbOnly
        ? "USB متصل"
        : device?.state === "offline"
          ? "غير جاهز"
          : "غير متصل";

  const shortHint = connected
    ? ""
    : device?.state === "unauthorized"
      ? "اسمح بتصحيح USB"
      : usbOnly
        ? "فعّل تصحيح USB"
        : "وصّل الهاتف ثم اضغط فحص";

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
          <button className={page === "connect" ? "nav active" : "nav"} onClick={() => setPage("connect")}>
            <PlugZap size={20} />
            اتصال الهاتف
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button className="update-link" onClick={updateInfo ? installUpdate : checkUpdate} disabled={checkingUpdate || updating}>
            <Download size={18} />
            {updateInfo
              ? updating
                ? "جارٍ التحديث " + (updateProgress?.percent ?? 0) + "٪"
                : "تحديث " + updateInfo.version
              : checkingUpdate
                ? "جارٍ الفحص..."
                : "فحص التحديث"}
          </button>
          <small>الإصدار 0.5.0</small>
        </div>
      </aside>

      <main className="main">
        <header className="main-header">
          <div>
            <span className="section-label">H TRANS</span>
            <h1>
              {page === "backup" ? "نسخ محادثات واتساب" : page === "restore" ? "استعادة المحادثات" : "اتصال الهاتف"}
            </h1>
          </div>

          <div className="header-status">
            <span className={connected ? "status connected" : usbOnly ? "status usb" : "status"}>
              <i />
              {statusText}
            </span>
            <button className="scan-button" onClick={scanPhone} disabled={scanning || running}>
              <RefreshCw size={17} className={scanning ? "spin" : ""} />
              {scanning ? "جارٍ الفحص" : "فحص الهاتف"}
            </button>
          </div>
        </header>

        {page === "connect" ? (
          <section className="connect-view">
            <PhonePreview
              device={device}
              phoneScreen={phoneScreen}
              statusText={statusText}
              shortHint={shortHint}
              onRefresh={() => capturePhoneScreen()}
              canRefresh={authorized}
            />

            <div className="connect-card">
              <div className="connect-row">
                <span>USB</span>
                <b className={diagnostic?.windowsUsbSeen ? "yes" : ""}>{diagnostic?.windowsUsbSeen ? "جاهز" : "—"}</b>
              </div>
              <div className="connect-row">
                <span>ADB</span>
                <b className={diagnostic?.adbDeviceSeen ? "yes" : ""}>{diagnostic?.adbDeviceSeen ? "جاهز" : "—"}</b>
              </div>
              <button className="primary large" onClick={scanPhone} disabled={scanning}>
                <PlugZap size={19} />
                {scanning ? "جارٍ الفحص..." : "فحص الاتصال"}
              </button>
              {shortHint && <p className="one-line-hint">{shortHint}</p>}
            </div>
          </section>
        ) : (
          <>
            <section className="transfer-workspace">
              <PhonePreview
                device={device}
                phoneScreen={phoneScreen}
                statusText={statusText}
                shortHint={shortHint}
                onRefresh={() => capturePhoneScreen()}
                canRefresh={authorized}
              />

              <div className="transfer-arrow">
                <div className="arrow-circle"><ArrowLeftRight size={28} /></div>
                <span>{page === "backup" ? "إلى الكمبيوتر" : "إلى الهاتف"}</span>
              </div>

              <div className="computer-card">
                <div className="computer-visual">
                  <Laptop size={94} strokeWidth={1.35} />
                </div>
                <strong>الكمبيوتر</strong>
                <span>{page === "backup" ? "مكان حفظ النسخة" : "ملف النسخة"}</span>
              </div>

              <div className="control-card">
                <h2>واتساب</h2>

                <button
                  className={variant === "personal" ? "variant active" : "variant"}
                  onClick={() => setVariant("personal")}
                >
                  <span className="variant-check">{variant === "personal" ? <Check size={16} /> : null}</span>
                  <div>
                    <strong>واتساب</strong>
                    <small>{connected ? (device?.whatsappInstalled ? "جاهز" : "غير مثبت") : "بانتظار الهاتف"}</small>
                  </div>
                </button>

                <button
                  className={variant === "business" ? "variant active" : "variant"}
                  onClick={() => setVariant("business")}
                >
                  <span className="variant-check">{variant === "business" ? <Check size={16} /> : null}</span>
                  <div>
                    <strong>واتساب للأعمال</strong>
                    <small>{connected ? (device?.whatsappBusinessInstalled ? "جاهز" : "غير مثبت") : "بانتظار الهاتف"}</small>
                  </div>
                </button>

                <div className="chat-only">المحادثات فقط</div>

                <button
                  className="primary action"
                  disabled={running || (page === "backup" ? !backupSupported : !authorized)}
                  onClick={page === "backup" ? doBackup : doRestore}
                >
                  {page === "backup" ? <HardDriveDownload size={20} /> : <ArchiveRestore size={20} />}
                  {running ? "جارٍ التنفيذ..." : page === "backup" ? "بدء النسخ" : "اختيار النسخة واستعادتها"}
                </button>
              </div>
            </section>

            <section className="bottom-bar">
              <div>
                <strong>{translateStage(progress.stage)}</strong>
                <span>{translateDetail(progress.detail) || (running ? "لا تفصل الهاتف" : "جاهز")}</span>
              </div>
              <div className="progress-wrap">
                <div className="progress-track"><i style={{ width: progress.percent + "%" }} /></div>
                <b>{progress.percent}٪</b>
              </div>
            </section>
          </>
        )}

        {result && <div className="toast-result">{result}</div>}
      </main>
    </div>
  );
}

function PhonePreview({
  device,
  phoneScreen,
  statusText,
  shortHint,
  onRefresh,
  canRefresh
}: {
  device: AndroidDevice | null;
  phoneScreen: string | null;
  statusText: string;
  shortHint: string;
  onRefresh: () => void;
  canRefresh: boolean;
}) {
  return (
    <div className="phone-card">
      <div className="card-head">
        <div>
          <span>هاتف Android</span>
          <strong>{device?.model || "غير متصل"}</strong>
        </div>
        {canRefresh && (
          <button className="icon-button" onClick={onRefresh} title="تحديث شاشة الهاتف">
            <RotateCw size={17} />
          </button>
        )}
      </div>

      <div className="phone-frame">
        <div className="speaker" />
        <div className="phone-screen">
          {phoneScreen ? (
            <img src={phoneScreen} alt="شاشة الهاتف" />
          ) : (
            <div className="phone-placeholder">
              <Smartphone size={54} />
              <strong>{statusText}</strong>
              {shortHint && <span>{shortHint}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="phone-status">
        <i className={device ? "online" : ""} />
        {statusText}
      </div>
    </div>
  );
}
