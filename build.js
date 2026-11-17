// Une src/shell.html + src/vendor (addons de three.js) + src/0*.js en un único index.html.
// Uso: node build.js [ruta-extra-sin-envoltorio]
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'src');

// Addons de three.js r160 (licencia MIT), envueltos para no chocar nombres y sin "import" sueltos.
const VENDOR = [
  'postprocessing/Pass.js', 'shaders/CopyShader.js', 'postprocessing/ShaderPass.js', 'postprocessing/MaskPass.js',
  'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js', 'shaders/OutputShader.js', 'postprocessing/OutputPass.js',
  'shaders/LuminosityHighPassShader.js', 'postprocessing/UnrealBloomPass.js', 'math/SimplexNoise.js', 'shaders/GTAOShader.js',
  'shaders/PoissonDenoiseShader.js', 'postprocessing/GTAOPass.js', 'loaders/RGBELoader.js', 'shaders/FXAAShader.js',
];
function wrapAddon(code, file) {
  const exported = new Set();
  code = code.replace(/import\s*\{([^}]*)\}\s*from\s*['"]three['"];?/g, (_, names) =>
    `const {${names.split(',').map((n) => n.trim()).filter(Boolean).map((n) => n.replace(/\s+as\s+/, ': ')).join(', ')}} = THREE;`);
  code = code.replace(/import\s*\{[^}]*\}\s*from\s*['"]\.[^'"]*['"];?/g, '');
  code = code.replace(/export\s*\{([^}]*)\};?/g, (_, names) => { names.split(',').map((n) => n.trim()).filter(Boolean).forEach((n) => exported.add(n.split(/\s+as\s+/).pop())); return ''; });
  code = code.replace(/export\s+(class|function|const|let)\s+([A-Za-z0-9_$]+)/g, (_, kw, name) => { exported.add(name); return `${kw} ${name}`; });
  if (/\bimport\s|\bexport\s/.test(code.replace(/\/\/.*$/gm, ''))) throw new Error('import/export sin resolver en ' + file);
  const names = [...exported].join(', ');
  return `// three.js examples/jsm/${file} (MIT)\nconst { ${names} } = (() => {\n${code}\nreturn { ${names} };\n})();\n`;
}
// arreglos puntuales: GTAOPass r160 falla si se le pasa un buffer de profundidad propio
const PATCH = { 'postprocessing/GTAOPass.js': [
  ['this.normalRenderTarget.dispose();', 'if ( this.normalRenderTarget ) this.normalRenderTarget.dispose();'],
  ['this.depthRenderMaterial.uniforms.tDepth.value = this.normalRenderTarget.depthTexture;', 'this.depthRenderMaterial.uniforms.tDepth.value = this.depthTexture;'],
  ['this.normalRenderTarget.setSize( width, height );', 'if ( this.normalRenderTarget ) this.normalRenderTarget.setSize( width, height );'],
] };
const readVendor = (f) => (PATCH[f] || []).reduce((code, [x, y]) => { if (!code.includes(x)) throw new Error('parche no aplicado en ' + f); return code.replace(x, y); }, fs.readFileSync(path.join(src, 'vendor', f), 'utf8'));
const vendor = VENDOR.map((f) => wrapAddon(readVendor(f), f)).join('\n');
const parts = fs.readdirSync(src).filter((f) => /^\d+-.*\.js$/.test(f)).sort().map((f) => fs.readFileSync(path.join(src, f), 'utf8'));
// la importación de three va primero; los addons después
const core = parts[0].split('\n'), imp = core.shift();
const js = [imp, vendor, core.join('\n'), ...parts.slice(1)].join('\n');
const html = fs.readFileSync(path.join(src, 'shell.html'), 'utf8').replace('/*GAME_JS*/', () => js);
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log('index.html', (html.length / 1024).toFixed(1) + ' KB');
if (process.argv[2]) {
  const bare = html.replace(/^<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport"[^\n]*\n/, '').replace('</head>\n<body>\n', '').replace(/<\/body>\n<\/html>\n?$/, '');
  fs.writeFileSync(process.argv[2], bare);
  console.log('artifact ->', process.argv[2]);
}
