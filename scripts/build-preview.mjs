// Genera una vista previa HTML autocontenida que transpila un componente de src/ en el navegador
// (React UMD + Tailwind Play CDN + lucide-react UMD + Babel standalone). Sin npm install.
// Uso: node scripts/build-preview.mjs [Componente]   (por defecto: NexoPlanificador)
//   node scripts/build-preview.mjs                 → preview.html
//   node scripts/build-preview.mjs Nexo            → preview-grupos.html
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const componente = process.argv[2] ?? 'NexoPlanificador';
const salida = componente === 'NexoPlanificador' ? 'preview.html' : 'preview-grupos.html';
const fuente = readFileSync(join(raiz, 'src', `${componente}.tsx`), 'utf8');
// El código va embebido en un <script type="text/plain">: no puede cerrar la etiqueta antes de tiempo
if (/<\/script/i.test(fuente)) throw new Error(`src/${componente}.tsx no puede contener la secuencia </script`);

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${componente === 'Nexo' ? 'Nexo Grupos' : 'Nexo Planificador'}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@700;800&display=swap">
<style>body{margin:0;background:#F3F4F6}</style>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>window.react = window.React; /* lucide-react UMD busca el global en minúsculas */</script>
<script src="https://cdn.jsdelivr.net/npm/lucide-react@0.263.1/dist/umd/lucide-react.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js"></script>
</head>
<body>
<div id="root"></div>
<script type="text/plain" id="nexo-src">${fuente}</script>
<script>
  // Transpila el TSX a CommonJS y resuelve los imports contra los globales UMD
  const fuente = document.getElementById('nexo-src').textContent;
  const { code } = Babel.transform(fuente, {
    filename: '${componente}.tsx',
    presets: ['react', ['typescript', { isTSX: true, allExtensions: true }]],
    plugins: ['transform-modules-commonjs'],
  });
  const modulos = { react: React, 'lucide-react': LucideReact };
  const modulo = { exports: {} };
  new Function('require', 'module', 'exports', code)((n) => modulos[n], modulo, modulo.exports);
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(modulo.exports.default));
</script>
</body>
</html>
`;

writeFileSync(join(raiz, salida), html);
console.log(`${salida} generado desde src/${componente}.tsx`);
