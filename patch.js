const fs = require('fs');
const path = require('path');
const p = path.resolve('src/app/api/chat/shared.chat.ts');
let c = fs.readFileSync(p, 'utf8');
c = c.replace(
  'logger.error(error);',
  'logger.error(error);\n  if (error && error.toJSON) logger.error("JSON", error.toJSON());\n  if (error && error.cause) logger.error("CAUSE", error.cause);\n  console.error("FULL ERROR", error);'
);
fs.writeFileSync(p, c);
console.log("patched!");
