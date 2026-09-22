import type { AndroidDiagnosticCode } from "../types";

export const ar = {
  appName: "H TRANS",
  tagline: "نسخ واستعادة محادثات واتساب",
  version: "الإصدار",
  updateAvailable: "تحديث متاح",
  updating: "جارٍ تحميل التحديث",
  checkUpdate: "فحص التحديث",
  updateChecking: "جارٍ فحص التحديث",
  noUpdate: "أنت تستخدم أحدث إصدار.",
  updateCheckFailed: "تعذر فحص التحديث",
  manualOnly: "يدوي",
  connectedDevice: "الهاتف",
  phoneReady: "الهاتف جاهز",
  usbDetected: "تم اكتشاف الهاتف عبر USB",
  adbRequired: "المتبقي فقط تفعيل اتصال ADB",
  connectTitle: "ربط الهاتف بـ H TRANS",
  connectSubtitle: "لن تظهر خيارات النسخ والاستعادة حتى يصبح اتصال Android جاهزًا بالكامل.",
  usbLink: "اتصال USB",
  adbEngine: "محرك ADB",
  adbDriver: "تعريف ADB",
  adbDevice: "جهاز ADB",
  honorTitle: "إعداد HONOR",
  honorText: "في هواتف HONOR فعّل USB debugging، وفعّل أيضًا السماح بتصحيح ADB في وضع الشحن فقط إن كان الخيار موجودًا.",
  connectionReady: "جاهز",
  waiting: "غير جاهز",
  retryConnection: "إعادة تشغيل ADB وفحص الهاتف",
  wirelessTitle: "حل بديل بدون تعريف USB",
  wirelessSubtitle: "استخدم «التصحيح اللاسلكي» من خيارات المطور. هذا يتجاوز مشكلة تعريف ADB عبر الكابل.",
  showWireless: "استخدام التصحيح اللاسلكي",
  hideWireless: "إخفاء الاتصال اللاسلكي",
  pairEndpoint: "عنوان الاقتران IP:PORT",
  pairCode: "رمز الاقتران",
  connectEndpoint: "عنوان الاتصال IP:PORT",
  pair: "اقتران",
  connect: "اتصال",
  pairSuccess: "تم الاقتران بنجاح",
  connectSuccess: "تم الاتصال اللاسلكي بنجاح",
  whatsapp: "واتساب",
  whatsappBusiness: "واتساب للأعمال",
  chatsOnly: "المحادثات فقط — الوسائط مستبعدة.",
  backup: "نسخ احتياطي",
  restore: "استعادة",
  backupTitle: "إنشاء نسخة احتياطية",
  backupText: "يحفظ H TRANS قواعد المحادثات المشفرة فقط على الكمبيوتر.",
  restoreTitle: "استعادة نسخة",
  restoreText: "اختر ملف H TRANS وسيتم التحقق منه وإنشاء نسخة أمان قبل الاستعادة.",
  ready: "جاهز",
  doNotDisconnect: "لا تفصل الهاتف أثناء العملية.",
  localOnly: "كل البيانات تبقى على هذا الكمبيوتر.",
  detected: "تم الاكتشاف",
  notDetected: "غير مثبت",
  saveBackupTitle: "اختر مكان حفظ نسخة H TRANS",
  backupFileType: "نسخة H TRANS",
  selectBackupTitle: "اختر نسخة H TRANS للاستعادة",
  restoreDialogTitle: "تأكيد الاستعادة",
  restoreContinue: "متابعة الاستعادة؟",
  restoreMediaNotice: "لن يتم تعديل الصور أو الفيديو أو الصوت أو المستندات.",
  restoreVerifyNotice: "سيتم التحقق من سلامة جميع ملفات المحادثات قبل الاستعادة.",
  restoreSafetyNotice: "سينشئ H TRANS نسخة أمان من النسخة المحلية الحالية قبل أي استبدال.",
  cannotOpenBackup: "تعذر فتح النسخة",
  backupFailed: "فشل النسخ الاحتياطي",
  restoreFailed: "فشلت الاستعادة",
  backupSaved: "تم حفظ النسخة بنجاح",
  restoredFiles: "تمت استعادة ملفات المحادثات",
  safetyBackup: "نسخة الأمان",
  noSafetyNeeded: "لم تكن هناك حاجة إلى نسخة أمان.",
  finishWhatsAppSetup: "أكمل إعداد واتساب واختر النسخة المحلية عندما تظهر شاشة الاستعادة."
} as const;

const diagnosticMap: Record<AndroidDiagnosticCode, { title: string; detail: string; steps?: string[] }> = {
  connected: {
    title: "الهاتف جاهز",
    detail: "تم إنشاء اتصال ADB كامل ويمكن لـ H TRANS تنفيذ النسخ والاستعادة."
  },
  unauthorized: {
    title: "بانتظار موافقة الهاتف",
    detail: "ADB يرى الهاتف لكن يحتاج موافقتك على بصمة RSA.",
    steps: [
      "افتح قفل الهاتف.",
      "اختر «السماح دائمًا من هذا الكمبيوتر».",
      "اضغط «سماح» ثم أعد الفحص."
    ]
  },
  offline: {
    title: "اتصال ADB غير مستقر",
    detail: "أعد توصيل الكابل ثم استخدم زر إعادة تشغيل ADB."
  },
  usb_seen_no_adb: {
    title: "الهاتف موجود",
    detail: "USB يعمل لكن ADB غير جاهز."
  },
  adb_interface_not_ready: {
    title: "بانتظار إذن ADB",
    detail: "افتح الهاتف ووافق على رسالة تصحيح USB."
  },
  adb_interface_missing: {
    title: "فعّل تصحيح USB",
    detail: "Windows يرى الهاتف لكن واجهة ADB غير ظاهرة."
  },
  no_usb_device: {
    title: "لم يتم اكتشاف هاتف عبر USB",
    detail: "استخدم كابل بيانات وافتح قفل الهاتف ثم جرّب منفذ USB آخر."
  },
  adb_unavailable: {
    title: "محرك ADB غير متاح",
    detail: "تعذر تشغيل Android Platform Tools المرفقة مع H TRANS."
  },
  adb_start_failed: {
    title: "تعذر بدء خدمة ADB",
    detail: "أغلق برامج إدارة الهواتف الأخرى ثم أعد الفحص."
  },
  adb_error: {
    title: "خطأ في فحص Android",
    detail: "أعد تشغيل الاتصال أو استخدم التصحيح اللاسلكي."
  }
};

export function diagnosticText(code: AndroidDiagnosticCode) {
  return diagnosticMap[code];
}

const stageMap: Record<string, string> = {
  Ready: ar.ready,
  "Starting backup": "بدء النسخ الاحتياطي",
  "Starting restore": "بدء الاستعادة",
  "Checking device": "التحقق من الهاتف",
  "Copying encrypted chat data": "نسخ بيانات المحادثات",
  "Creating H TRANS backup": "إنشاء ملف H TRANS",
  "Backup complete": "اكتمل النسخ الاحتياطي",
  "Creating Safety Backup": "إنشاء نسخة أمان",
  "Verifying Safety Backup": "التحقق من نسخة الأمان",
  "Safety Backup verified": "تم التحقق من نسخة الأمان",
  "Fresh restore mode": "تجهيز الاستعادة",
  "Validating H TRANS backup": "التحقق من النسخة",
  "Extracting verified chat databases": "استخراج ملفات المحادثات",
  "Preparing local backup folder": "تجهيز مجلد الاستعادة",
  "Restoring chat database": "استعادة المحادثات",
  "Verifying restored files on phone": "التحقق من الهاتف",
  "Restore files ready": "اكتملت الاستعادة"
};

export function translateStage(stage: string): string {
  return stageMap[stage] ?? stage;
}

export function translateDetail(detail?: string): string | undefined {
  if (!detail) return undefined;
  const bytes = detail.match(/^(\d+) \/ (\d+) bytes$/);
  if (bytes) return bytes[1] + " / " + bytes[2] + " بايت";
  return detail;
}

export function translateBackendError(error: unknown): string {
  const raw = String(error);
  const replacements: Array<[string, string]> = [
    ["No authorized Android device is connected.", "لا يوجد هاتف Android جاهز للاتصال."],
    ["No local WhatsApp chat backup was found on the phone.", "لم يتم العثور على نسخة محلية لمحادثات واتساب."],
    ["ADB is not available.", "تعذر تشغيل ADB."],
    ["Invalid or damaged H TRANS backup:", "نسخة H TRANS تالفة أو غير صالحة:"],
    ["ADB error:", "خطأ ADB:"]
  ];

  let translated = raw;
  for (const [from, to] of replacements) translated = translated.replace(from, to);
  return translated;
}
