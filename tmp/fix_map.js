const fs = require('fs');
const data = JSON.parse(fs.readFileSync('public/maps/office2.json', 'utf8'));
data.tilesets.forEach(ts => {
  if (ts.image) {
    ts.image = '../tilesets/' + ts.image.split(/[\\/]/).pop();
  }
});
fs.writeFileSync('public/maps/office2.json', JSON.stringify(data, null, 1));
console.log('Done!');
