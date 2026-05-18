import fs from 'fs';
import path from 'path';

const locales = process.argv[2] ? [process.argv[2]] : ['id', 'ar', 'es', 'fr', 'ja', 'ko', 'no', 'zh'];
const messagesDir = './messages';

function getKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = keys.concat(getKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

const enFilePath = path.join(messagesDir, `en.json`);
const enContent = JSON.parse(fs.readFileSync(enFilePath, 'utf8'));
const enKeys = new Set(getKeys(enContent));

locales.forEach(locale => {
  const filePath = path.join(messagesDir, `${locale}.json`);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const currentKeys = new Set(getKeys(content));
  const missing = [...enKeys].filter(k => !currentKeys.has(k));
  
  if (missing.length > 0) {
    console.log(`Missing keys in ${locale}.json:`);
    console.log(JSON.stringify(missing, null, 2));
  } else {
    console.log(`No missing keys in ${locale}.json!`);
  }
});
