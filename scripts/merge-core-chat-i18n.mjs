import fs from 'fs';
import path from 'path';

const locales = ['id', 'ar', 'es', 'fr', 'ja', 'ko', 'no', 'zh'];
const messagesDir = './messages';

const translations = {
  Common: {
    copy: {
      id: "Salin",
      ar: "نسخ",
      es: "Copiar",
      fr: "Copier",
      ja: "コピー",
      ko: "복사",
      no: "Kopier",
      zh: "复制"
    }
  },
  Chat: {
    uploadFile: {
      id: "Upload File",
      ar: "رفع ملف",
      es: "Subir archivo",
      fr: "Télécharger un fichier",
      ja: "ファイルをアップロード",
      ko: "파일 업로드",
      no: "Last opp fil",
      zh: "上传文件"
    },
    uploadPhoto: {
      id: "Upload Foto",
      ar: "رفع صورة",
      es: "Subir foto",
      fr: "Télécharger une photo",
      ja: "写真をアップロード",
      ko: "사진 업로드",
      no: "Last opp bilde",
      zh: "上传照片"
    },
    deleteMessage: {
      id: "Hapus Pesan",
      ar: "حذف الرسالة",
      es: "Eliminar mensaje",
      fr: "Supprimer le message",
      ja: "メッセージを削除",
      ko: "메시지 삭제",
      no: "Slett melding",
      zh: "删除消息"
    },
    confirmDeleteMessage: {
      id: "Yakin mau hapus pesan ini?",
      ar: "هل أنت متأكد من حذف هذه الرسالة؟",
      es: "¿Estás seguro de que quieres eliminar este mensaje?",
      fr: "Êtes-vous sûr de vouloir supprimer le message ?",
      ja: "このメッセージを削除してもよろしいですか？",
      ko: "이 메시지를 삭제하시겠습니까?",
      no: "Er du sikker på at du vil slette denne meldingen?",
      zh: "您确定要删除此消息吗？"
    },
    changeModel: {
      id: "Ganti Model",
      ar: "تغيير النموذج",
      es: "Cambiar modelo",
      fr: "Changer le modèle",
      ja: "モデルを変更",
      ko: "모델 변경",
      no: "Bytt modell",
      zh: "切换模型"
    },
    agent: {
      id: "Agen",
      ar: "عميل",
      es: "Agente",
      fr: "Agent",
      ja: "エージェント",
      ko: "에이전트",
      no: "Agent",
      zh: "智能体"
    },
    model: {
      id: "Model",
      ar: "نموذج",
      es: "Modelo",
      fr: "Modèle",
      ja: "モデル",
      ko: "모델",
      no: "Modell",
      zh: "模型"
    },
    tokenUsage: {
      id: "Penggunaan Token",
      ar: "استهلاك الرموز",
      es: "Uso de tokens",
      fr: "Utilisation des jetons",
      ja: "トークン使用量",
      ko: "토큰 사용량",
      no: "Tokenbruk",
      zh: "Token 使用量"
    },
    steps: {
      id: "Langkah",
      ar: "خطوات",
      es: "Pasos",
      fr: "Étapes",
      ja: "ステップ",
      ko: "단계",
      no: "Trinn",
      zh: "步骤"
    },
    input: {
      id: "Input",
      ar: "مدخلات",
      es: "Entrada",
      fr: "Entrée",
      ja: "入力",
      ko: "입력",
      no: "Input",
      zh: "输入"
    },
    output: {
      id: "Output",
      ar: "مخرجات",
      es: "Salida",
      fr: "Sortie",
      ja: "出力",
      ko: "출력",
      no: "Output",
      zh: "输出"
    },
    total: {
      id: "Total",
      ar: "الإجمالي",
      es: "Total",
      fr: "Total",
      ja: "合計",
      ko: "합계",
      no: "Total",
      zh: "总计"
    },
    highUsageTip: {
      id: "Penggunaan token input mungkin tinggi kalau banyak alat yang aktif.",
      ar: "قد يحدث استهلاك عالٍ للرموز عند توفر العديد من الأدوات.",
      es: "El uso de tokens de entrada puede ser alto cuando hay muchas herramientas disponibles.",
      fr: "L'utilisation des jetons d'entrée peut être élevée lorsque de nombreux outils sont disponibles.",
      ja: "多くのツールが利用可能な場合、入力トークンの使用量が増える可能性があります。",
      ko: "사용 가능한 도구가 많을 때 입력 토큰 사용량이 많아질 수 있습니다.",
      no: "Høyt tokenforbruk kan forekomme når mange verktøy er tilgjengelige.",
      zh: "当可用工具较多时，输入 Token 的使用量可能会较高。"
    },
    reasoning: {
      title: {
        id: "Berpikir selama beberapa detik",
        ar: "تم التفكير لبضع ثوانٍ",
        es: "Pensado por unos segundos",
        fr: "Réfléchi pendant quelques secondes",
        ja: "数秒間考えました",
        ko: "몇 초 동안 생각했습니다",
        no: "Tenkte i noen sekunder",
        zh: "思考了几秒钟"
      },
      default: {
        id: "Hmm, coba kita lihat...🤔",
        ar: "هممم، دعنا نرى...🤔",
        es: "Hmm, veamos...🤔",
        fr: "Hmm, voyons voir...🤔",
        ja: "うーん、見てみましょう...🤔",
        ko: "흠, 한번 볼까요...🤔",
        no: "Hmm, la oss se...🤔",
        zh: "嗯，让我看看...🤔"
      }
    },
    waitForUpload: {
      id: "Tunggu sampai file selesai di-upload sebelum kirim ya.",
      ar: "يرجى الانتظار حتى ينتهي رفع الملفات قبل الإرسال.",
      es: "Por favor, espera a que los archivos terminen de subirse antes de enviar.",
      fr: "Veuillez attendre la fin du téléchargement des fichiers avant de les envoyer.",
      ja: "送信する前に、ファイルのアップロードが完了するまでお待ちください。",
      ko: "전송하기 전에 파일 업로드가 완료될 때까지 기다려 주세요.",
      no: "Vennligst vent til filene er ferdig opplastet før du sender.",
      zh: "请等待文件上传完成后再发送。"
    },
    noFileUrl: {
      id: "URL file nggak ketemu",
      ar: "رابط الملف غير متوفر",
      es: "URL de archivo no disponible",
      fr: "URL du fichier non disponible",
      ja: "ファイルのURLが利用できません",
      ko: "파일 URL을 사용할 수 없습니다",
      no: "Fil-URL ikke tilgjengelig",
      zh: "文件 URL 不可用"
    },
    failedToIngest: {
      id: "Gagal proses file",
      ar: "فشل في معالجة الملف",
      es: "Error al procesar el archivo",
      fr: "Échec du traitement du fichier",
      ja: "ファイルの処理に失敗しました",
      ko: "파일 처리에 실패했습니다",
      no: "Feil under behandling av fil",
      zh: "处理文件失败"
    },
    summarize: {
      id: "Ringkas",
      ar: "تلخيص",
      es: "Resumir",
      fr: "Résumer",
      ja: "要約",
      ko: "요약",
      no: "Oppsummer",
      zh: "总结"
    }
  }
};

locales.forEach(locale => {
  const filePath = path.join(messagesDir, `${locale}.json`);
  if (!fs.existsSync(filePath)) return;
  
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  // Merge Common
  if (!content.Common) content.Common = {};
  content.Common.copy = translations.Common.copy[locale];
  
  // Merge Chat
  if (!content.Chat) content.Chat = {};
  
  // Remove old uploadImage if exists
  delete content.Chat.uploadImage;
  
  content.Chat.uploadFile = translations.Chat.uploadFile[locale];
  content.Chat.uploadPhoto = translations.Chat.uploadPhoto[locale];
  content.Chat.deleteMessage = translations.Chat.deleteMessage[locale];
  content.Chat.confirmDeleteMessage = translations.Chat.confirmDeleteMessage[locale];
  content.Chat.changeModel = translations.Chat.changeModel[locale];
  content.Chat.agent = translations.Chat.agent[locale];
  content.Chat.model = translations.Chat.model[locale];
  content.Chat.tokenUsage = translations.Chat.tokenUsage[locale];
  content.Chat.steps = translations.Chat.steps[locale];
  content.Chat.input = translations.Chat.input[locale];
  content.Chat.output = translations.Chat.output[locale];
  content.Chat.total = translations.Chat.total[locale];
  content.Chat.highUsageTip = translations.Chat.highUsageTip[locale];
  
  if (!content.Chat.reasoning) content.Chat.reasoning = {};
  content.Chat.reasoning.title = translations.Chat.reasoning.title[locale];
  content.Chat.reasoning.default = translations.Chat.reasoning.default[locale];
  
  content.Chat.waitForUpload = translations.Chat.waitForUpload[locale];
  content.Chat.noFileUrl = translations.Chat.noFileUrl[locale];
  content.Chat.failedToIngest = translations.Chat.failedToIngest[locale];
  content.Chat.summarize = translations.Chat.summarize[locale];
  
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
  console.log(`Updated ${locale}.json`);
});
