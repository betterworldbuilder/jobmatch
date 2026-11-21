// Test helper: bundle one TS/TSX module with esbuild (already installed with Vite) so
// `node --test` can render React components server-side without extra test frameworks.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Inside node_modules so bundled externals (react, motion, lucide) resolve to the same copies the test uses.
const outDir = path.join(root, 'node_modules', '.cache', 'jm-tests');
let counter = 0;

export async function loadTsx(entryUrl) {
  const entry = fileURLToPath(entryUrl);
  const result = await build({
    entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', logLevel: 'silent',
    external: ['react', 'react-dom', 'react/*', 'react-dom/*', 'motion', 'motion/*', 'lucide-react', '@capacitor/*'],
    define: { 'import.meta.env': '{}' },
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
  });
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${path.basename(entry).replace(/\W/g, '_')}_${process.pid}_${counter++}.mjs`);
  writeFileSync(file, result.outputFiles[0].text);
  const [mod, React, server] = await Promise.all([import(pathToFileURL(file).href), import('react'), import('react-dom/server')]);
  return { mod, React: React.default || React, renderToStaticMarkup: server.renderToStaticMarkup };
}
