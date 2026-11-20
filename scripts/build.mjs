import { generateTemplate } from './generate-template.mjs';
import { copyFile, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';

// Ensures html5-qrcode is hosted from our own origin and precached by sw.js.
const variants = [
  'node_modules/html5-qrcode/html5-qrcode.min.js',
  'node_modules/html5-qrcode/minified/html5-qrcode.min.js',
  'node_modules/html5-qrcode/dist/html5-qrcode.min.js'
];
let source;
for (const file of variants) {
  try { await access(resolve(file)); source = resolve(file); break; } catch {}
}
if (!source) {
  throw new Error('html5-qrcode minified JS not found. Run npm install and verify package layout.');
}
await mkdir(resolve('public/vendor'), { recursive: true });
await copyFile(source, resolve('public/vendor/html5-qrcode.min.js'));
console.log('Build completed. Static output: public/; Pages Functions: functions/.');

await generateTemplate();
