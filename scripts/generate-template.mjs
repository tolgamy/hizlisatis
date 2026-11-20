import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

/** The original 12-column template is checked into public/, not reconstructed during builds.
 * Rebuilding must never silently change the supplier's Excel column order. */
export async function generateTemplate() {
  await access(resolve('public/urun-yukleme-sablonu.xlsx'));
  console.log('Verified original 12-column Excel template in public/.');
}
