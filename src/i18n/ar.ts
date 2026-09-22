import type { AndroidDiagnosticCode } from "../types";

export const ar = {
  appName: "H TRANS",
  tagline: "محادثاتك على جهازك",
  refresh: "تحديث",
  repairConnection: "إعادة فحص وإصلاح الاتصال",
  repairingConnection: "جارٍ إعادة تشغيل الاتصال...",
  connectedDevice: "الجهاز المتصل",
  phoneDetected: "تم التعرف على هاتف Android",
  phoneUsbDetected: "تم التعرف على الهاتف عبر USB",
  connectPhone: "قم بتوصيل هاتف Android",
  connected: "متصل",
  usbConnected: "متصل عبر USB",
  adbRequired: "يلزم تفعيل اتصال ADB لإكمال النسخ والاستعادة",
  waiting: "بانتظار الاتصال",
  unauthorized: "بانتظار سماح تصحيح USB من الهاتف",
  offline: "اتصال ADB غير مستقر",
  authorizationRequired: "الهاتف بانتظار موافقتك",
  noPhone: "لا يوجد هاتف متصل",
  usbHelp: "قم بتوصيل كابل بيانات وافتح قفل الهاتف.",
  usbAuthorizeHelp: "افتح الهاتف ووافق على رسالة «السماح بتصحيح USB» ثم اختر السماح دائمًا لهذا الكمبيوتر.",
  connectionCheck: "حالة الاتصال",
  usbDetected: "الهاتف الذي رصده Windows",
  adbEngine: "محرك ADB",
  adbDevice: "جهاز ADB",
  adbDriver: "واجهة ADB",
  usbLink: "اتصال USB",
  serial: "الرقم التسلسلي",
  battery: "البطارية",
  storage: "التخزين",
  mediaPolicy: "الوسائط",
  alwaysExcluded: "مستبعدة دائمًا",
  selectData: "اختر البيانات",
  whatsappChats: "محادثات واتساب",
  chatsOnlyDescription: "يتم نسخ المحادثات فقط، بدون الصور والفيديو والصوت والمستندات.",
  whatsapp: "واتساب",
  whatsappBusiness: "واتساب للأعمال",
  detected: "تم الاكتشاف",
  notDetected: "غير مكتشف",
  waitingForAdb: "بانتظار تفعيل ADB",
  localOnly: "محلي 100٪ — لا يتم رفع المحادثات إلى أي خادم.",
  backup: "نسخ احتياطي",
  restore: "استعادة",
  ready: "جاهز",
  startingBackup: "بدء النسخ الاحتياطي",
  startingRestore: "بدء الاستعادة",
  doNotDisconnect: "لا تفصل الهاتف أثناء العملية.",
  saveBackupTitle: "اختر مكان حفظ نسخة H TRANS",
  backupFileType: "نسخة H TRANS",
  selectBackupTitle: "اختر نسخة H TRANS للاستعادة",
  restoreDialogTitle: "استعادة H TRANS",
  restoreContinue: "هل تريد المتابعة؟",
  restoreMediaNotice: "لن يتم تعديل الصور أو الفيديو أو الصوت أو المستندات.",
  restoreVerifyNotice: "سيتم التحقق من سلامة جميع ملفات المحادثات قبل الاستعادة.",
  restoreSafetyNotice: "إذا كان واتساب مثبتًا، سينشئ H TRANS نسخة أمان من النسخة المحلية الحالية قبل استبدال ملفات المحادثات.",
  cannotOpenBackup: "تعذر فتح النسخة الاحتياطية",
  backupFailed: "فشل النسخ الاحتياطي",
  restoreFailed: "فشلت الاستعادة",
  backupSaved: "تم التحقق من النسخة وحفظها",
  restoredFiles: "تمت استعادة ملفات قاعدة المحادثات",
  safetyBackup: "نسخة الأمان",
  noSafetyNeeded: "لم تكن هناك حاجة لنسخة أمان لأن واتساب غير مثبت حاليًا.",
  finishWhatsAppSetup: "أكمل إعداد واتساب واختر النسخة المحلية عندما تظهر لك شاشة الاستعادة."
} as const;

const diagnosticMap: Record<AndroidDiagnosticCode, { title: string; detail: string; steps?: string[] }> = {
  connected: {
    title: "الهاتف جاهز",
    detail: "تم إنشاء اتصال ADB كامل مع الهاتف."
  },
  unauthorized: {
    title: "الهاتف ظاهر في ADB وينتظر السماح",
    detail: "اتصال USB وADB يعملان، لكن الهاتف لم يمنح هذا الكمبيوتر الإذن بعد.",
    steps: [
      "افتح قفل الهاتف.",
      "ابحث عن نافذة «السماح بتصحيح USB».",
      "فعّل «السماح دائمًا من هذا الكمبيوتر» ثم اضغط «سماح»."
    ]
  },
  offline: {
    title: "الهاتف ظاهر لكن اتصال ADB غير مستقر",
    detail: "أعد توصيل الكابل ثم استخدم زر إعادة فحص وإصلاح الاتصال."
  },
  usb_seen_no_adb: {
    title: "الهاتف متصل عبر USB لكن قناة ADB غير مفعلة",
    detail: "H TRANS تعرّف على الهاتف من Windows. المتبقي هو تفعيل اتصال المطور الذي يسمح للبرنامج بالتواصل مع Android.",
    steps: [
      "في الهاتف اختر وضع USB «نقل الملفات» بدل «شحن فقط».",
      "فعّل «خيارات المطور» ثم فعّل «تصحيح USB».",
      "افصل الكابل وأعد توصيله إذا لم تظهر رسالة السماح.",
      "عند ظهور بصمة RSA اختر «السماح دائمًا من هذا الكمبيوتر» ثم «سماح»."
    ]
  },
  no_usb_device: {
    title: "Windows لا يرى هاتف Android",
    detail: "جرّب كابل بيانات ومنفذ USB آخر وافتح قفل الهاتف قبل إعادة الفحص."
  },
  adb_unavailable: {
    title: "تعذر تشغيل محرك ADB",
    detail: "نسخة H TRANS الحالية لا تستطيع تشغيل Android Platform Tools."
  },
  adb_start_failed: {
    title: "تعذر بدء خدمة ADB",
    detail: "قد يكون برنامج آخر يستخدم ADB. أغلق برامج إدارة الهواتف ثم أعد الفحص."
  },
  adb_error: {
    title: "تعذر فحص ADB",
    detail: "أعد توصيل الهاتف ثم استخدم زر إعادة فحص وإصلاح الاتصال."
  }
};

export function diagnosticText(code: AndroidDiagnosticCode) {
  return diagnosticMap[code];
}

const stageMap: Record<string, string> = {
  Ready: ar.ready,
  "Starting backup": ar.startingBackup,
  "Starting restore": ar.startingRestore,
  "Checking device": "التحقق من الهاتف",
  "Copying encrypted chat data": "نسخ بيانات المحادثات المشفرة",
  "Creating H TRANS backup": "إنشاء نسخة H TRANS",
  "Backup complete": "اكتمل النسخ الاحتياطي",
  "Creating Safety Backup": "إنشاء نسخة أمان",
  "Verifying Safety Backup": "التحقق من نسخة الأمان",
  "Safety Backup verified": "تم التحقق من نسخة الأمان",
  "Fresh restore mode": "تجهيز الاستعادة الجديدة",
  "Validating H TRANS backup": "التحقق من نسخة H TRANS",
  "Extracting verified chat databases": "استخراج قواعد المحادثات بعد التحقق",
  "Preparing local backup folder": "تجهيز مجلد النسخة المحلية",
  "Restoring chat database": "استعادة قاعدة المحادثات",
  "Verifying restored files on phone": "التحقق من الملفات على الهاتف",
  "Restore files ready": "اكتملت ملفات الاستعادة"
};

export function translateStage(stage: string): string {
  return stageMap[stage] ?? stage;
}

export function translateDetail(detail?: string): string | undefined {
  if (!detail) return undefined;

  const exact: Record<string, string> = {
    "Media is excluded": "الوسائط مستبعدة",
    "Copying current local WhatsApp chat backups before any changes":
      "يتم حفظ نسخة أمان من محادثات واتساب الحالية قبل أي تغيير",
    "No existing WhatsApp installation detected; Safety Backup is not required":
      "لم يتم اكتشاف واتساب مثبت، لذلك لا يلزم إنشاء نسخة أمان",
    "Checking every embedded chat database checksum":
      "يتم التحقق من سلامة كل ملف محادثات داخل النسخة",
    "Only msgstore database files are replaced. Media is untouched.":
      "سيتم استبدال ملفات المحادثات فقط، ولن يتم لمس الوسائط.",
    "H TRANS has restored the encrypted local chat backups. Complete WhatsApp setup and select the local backup when prompted.":
      ar.finishWhatsAppSetup
  };

  if (exact[detail]) return exact[detail];

  const bytes = detail.match(/^(\d+) \/ (\d+) bytes$/);
  if (bytes) return `${bytes[1]} / ${bytes[2]} بايت`;

  return detail;
}

export function translateBackendError(error: unknown): string {
  const raw = String(error);
  const replacements: Array<[string, string]> = [
    ["No authorized Android device is connected.", "لا يوجد هاتف Android متصل ومصرح له."],
    ["No local WhatsApp chat backup was found on the phone.", "لم يتم العثور على نسخة محلية لمحادثات واتساب على الهاتف."],
    ["H TRANS cannot safely restore over an existing WhatsApp installation because no current local msgstore backup was found. Create a WhatsApp backup first, then retry.", "لا يمكن تنفيذ الاستعادة بأمان لأن واتساب مثبت ولا توجد نسخة محلية حالية يمكن حفظها كنسخة أمان. أنشئ نسخة محلية من داخل واتساب ثم أعد المحاولة."],
    ["ADB is not available. Use an official H TRANS build or set HTRANS_ADB to adb.exe.", "تعذر تشغيل ADB. استخدم نسخة H TRANS الرسمية التي تتضمن ADB."],
    ["Unsupported WhatsApp variant:", "نوع واتساب غير مدعوم:"],
    ["Invalid or damaged H TRANS backup:", "نسخة H TRANS غير صالحة أو تالفة:"],
    ["ADB error:", "خطأ ADB:"],
    ["Path error:", "خطأ في المسار:"]
  ];

  let translated = raw;
  for (const [from, to] of replacements) {
    translated = translated.replace(from, to);
  }
  return translated;
}
