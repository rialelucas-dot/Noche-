// Une src/shell.html + src/0*.js en un único index.html autocontenido.
// Uso: node build.js [ruta-extra-sin-envoltorio]
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'src');
const js = fs.readdirSync(src).filter((f) => /^\d+-.*\.js$/.test(f)).sort().map((f) => fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
const html = fs.readFileSync(path.join(src, 'shell.html'), 'utf8').replace('/*GAME_JS*/', () => js);
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log('index.html', (html.length / 1024).toFixed(1) + ' KB');
if (process.argv[2]) {
  const bare = html.replace(/^<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport"[^\n]*\n/, '').replace('</head>\n<body>\n', '').replace(/<\/body>\n<\/html>\n?$/, '');
  fs.writeFileSync(process.argv[2], bare);
  console.log('artifact ->', process.argv[2]);
}
