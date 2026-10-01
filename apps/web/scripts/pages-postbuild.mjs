// GitHub Pages has no SPA rewrites: it serves 404.html for unknown paths, so
// a copy of index.html there lets deep links like /movimientos boot the app
// (the Angular router then reads the URL). .nojekyll disables Jekyll processing.
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../dist/web/browser/', import.meta.url).pathname;
if (!existsSync(join(dir, 'index.html'))) {
  console.error(`index.html not found in ${dir}; run the demo build first.`);
  process.exit(1);
}
copyFileSync(join(dir, 'index.html'), join(dir, '404.html'));
writeFileSync(join(dir, '.nojekyll'), '');
console.log(`GitHub Pages files ready in ${dir} (404.html, .nojekyll)`);
