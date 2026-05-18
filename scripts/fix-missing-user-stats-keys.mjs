import fs from 'fs';
import path from 'path';

const locales = ['en', 'id', 'ar', 'es', 'fr', 'ja', 'ko', 'no', 'zh'];
const messagesDir = './messages';

const translations = {
  totalTokens: {
    en: "Total Tokens",
    id: "Total Token",
    ar: "إجمالي الرموز",
    es: "Tokens Totales",
    fr: "Total des Jetons",
    ja: "合計トークン",
    ko: "총 토큰",
    no: "Totalt Antall Tokens",
    zh: "总 Tokens"
  },
  models: {
    en: "Models",
    id: "Model",
    ar: "النماذج",
    es: "Modelos",
    fr: "Modèles",
    ja: "モデル",
    ko: "모델",
    no: "Modeller",
    zh: "模型"
  },
  messages: {
    en: "Messages",
    id: "Pesan",
    ar: "الرسائل",
    es: "Mensajes",
    fr: "Messages",
    ja: "メッセージ",
    ko: "메시지",
    no: "Meldinger",
    zh: "消息"
  },
  topModelsByTokenUsage: {
    en: "Top Models by Token Usage",
    id: "Model Teratas Berdasarkan Penggunaan Token",
    ar: "أفضل النماذج حسب استهلاك الرموز",
    es: "Principales Modelos por Uso de Tokens",
    fr: "Meilleurs Modèles par Utilisation de Jetons",
    ja: "トークン使用量上位モデル",
    ko: "토큰 사용량 기준 상위 모델",
    no: "Topp Modeller etter Tokenbruk",
    zh: "按 Token 使用量排名的主要模型"
  },
  conversations: {
    en: "Conversations",
    id: "Percakapan",
    ar: "المحادثات",
    es: "Conversaciones",
    fr: "Conversations",
    ja: "会話",
    ko: "대화",
    no: "Samtaler",
    zh: "对话"
  },
  avgTokensPerMessage: {
    en: "Avg Tokens / Message",
    id: "Rata-rata Token / Pesan",
    ar: "متوسط الرموز / الرسالة",
    es: "Promedio de Tokens / Mensaje",
    fr: "Moy. Jetons / Message",
    ja: "平均トークン / メッセージ",
    ko: "평균 토큰 / 메시지",
    no: "Gjennomsnittlig Tokens / Melding",
    zh: "平均 Token / 消息"
  },
  topModel: {
    en: "Top Model",
    id: "Model Teratas",
    ar: "أفضل نموذج",
    es: "Mejor Modelo",
    fr: "Meilleur Modèle",
    ja: "トップモデル",
    ko: "최고 모델",
    no: "Topp Modell",
    zh: "最佳模型"
  },
  tokensAcross: {
    en: "{tokens} tokens across {count} {period}",
    id: "{tokens} token selama {count} {period}",
    ar: "{tokens} رمز خلال {count} {period}",
    es: "{tokens} tokens en {count} {period}",
    fr: "{tokens} jetons sur {count} {period}",
    ja: "{count} {period}間でのトークン数：{tokens}",
    ko: "{count} {period} 동안 {tokens} 토큰",
    no: "{tokens} tokens over {count} {period}",
    zh: "在 {count} {period} 内使用 {tokens} 个 Token"
  },
  mostActive: {
    en: "Most active with {model} ({tokens} tokens).",
    id: "Paling aktif menggunakan {model} ({tokens} token).",
    ar: "الأكثر نشاطًا باستخدام {model} ({tokens} رمز).",
    es: "Más activo con {model} ({tokens} tokens).",
    fr: "Le plus actif avec {model} ({tokens} jetons).",
    ja: "{model} で最もアクティブ（{tokens} トークン）。",
    ko: "{model}에서 가장 활성화됨({tokens} 토큰).",
    no: "Mest aktiv med {model} ({tokens} tokens).",
    zh: "在 {model} 上最活跃（{tokens} 个 Token）。"
  }
};

locales.forEach(locale => {
  const filePath = path.join(messagesDir, `${locale}.json`);
  if (!fs.existsSync(filePath)) return;
  
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  if (!content.User) content.User = {};
  if (!content.User.Profile) content.User.Profile = {};
  if (!content.User.Profile.common) content.User.Profile.common = {};
  
  const target = content.User.Profile.common;
  
  Object.keys(translations).forEach(key => {
    target[key] = translations[key][locale];
  });
  
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
  console.log(`Updated ${locale}.json`);
});
