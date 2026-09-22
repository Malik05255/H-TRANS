export const ar = {
  appName: "H TRANS",
  tagline: "محادثاتك على جهازك",
  refresh: "تحديث",
  connectedDevice: "الجهاز المتصل",
  phoneDetected: "تم التعرف على هاتف Android",
  connectPhone: "قم بتوصيل هاتف Android",
  connected: "متصل",
  waiting: "بانتظار الاتصال",
  unauthorized: "افتح الهاتف واضغط سماح لتصحيح USB",
  offline: "أعد توصيل كابل USB",
  authorizationRequired: "مطلوب السماح بالاتصال",
  noPhone: "لا يوجد هاتف متصل",
  usbHelp: "قم بتوصيل USB وتفعيل تصحيح USB.",
  usbAuthorizeHelp: "افتح الهاتف ووافق على رسالة تصحيح USB.",
  serial: "الرقم التسلسلي",
  battery: "البطارية",
  storage: "التخزين",
  mediaPolicy: "الوسائط",
  alwaysExcluded: "مستبعدة دائمًا",
  selectData: "اختر البيانات",
  whatsappChats: "محادثات واتساب",
  chatsOnlyDescription: "المحادثات فقط. الصور والفيديو والصوت والمستندات لا يتم تضمينها أو تعديلها.",
  whatsapp: "واتساب",
  whatsappBusiness: "واتساب للأعمال",
  detected: "تم الاكتشاف",
  notDetected: "غير مكتشف",
  localOnly: "محلي 100٪. لا يرفع H TRANS بيانات المحادثات إلى أي خادم.",
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
