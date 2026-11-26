import {accountStorage130} from './account-storage-v130.js';
/** Defensive localStorage mirror of product status. IndexedDB stays primary.
 * The baseline is created on the one-time bulk operation; subsequent edits are
 * stored separately, avoiding rewriting 19k rows on every single product change.
 */
const BASELINE_KEY = 'hizlisatis:product-lifecycle:bulk-v1';
const CHANGE_KEY = 'hizlisatis:product-lifecycle:edits-v1';

const valid = new Set(['active','initial-inactive','later-inactive','deleted']);
function storageOrNull(provided) {
  if (provided !== undefined) return provided;
  try { return accountStorage130() || null; }
  catch { return null; }
}

function encode(product) {
  return [product.lifecycleStatus || 'active', Boolean(product.everActivated) ? 1 : 0,
    product.deletedFrom || '', product.statusChangedAt || ''];
}
function decode(encoded) {
  if (!Array.isArray(encoded) || !valid.has(encoded[0])) return null;
  return { lifecycleStatus: encoded[0], everActivated: Boolean(encoded[1]),
    deletedFrom: encoded[2] || null, statusChangedAt: encoded[3] || null };
}
function read(key, storage) {
  try {
    const result = JSON.parse(storage?.getItem(key) || '{}');
    return result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  } catch { return {}; }
}
function time(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Keep even active states so re-activations cannot be reverted by the baseline. */
export function rememberProductStatus(product, storage = undefined) {
  try {
    storage = storageOrNull(storage);
    if (!storage || !product?.id) return false;
    const changes = read(CHANGE_KEY, storage);
    changes[product.id] = encode(product);
    storage.setItem(CHANGE_KEY, JSON.stringify(changes));
    return true;
  } catch { return false; }
}

/** Only used after a successfully committed initial bulk deactivation. */
export function rememberBulkStatuses(products, storage = undefined) {
  try {
    storage = storageOrNull(storage);
    if (!storage || !Array.isArray(products)) return false;
    const baseline = {};
    for (const item of products) {
      if (item.id && item.lifecycleStatus && item.lifecycleStatus !== 'active')
        baseline[item.id] = encode(item);
    }
    storage.setItem(BASELINE_KEY, JSON.stringify(baseline));
    return true;
  } catch { return false; }
}

/** Restore a state only if it is demonstrably newer than IndexedDB's state. */
export function overlayLifecycleBackup(products, storage = undefined) {
  if (!Array.isArray(products)) return [];
  storage = storageOrNull(storage);
  const baseline = read(BASELINE_KEY, storage);
  const changes = read(CHANGE_KEY, storage);
  return products.map(product => {
    const initial = decode(baseline[product.id]);
    const edit = decode(changes[product.id]);
    const candidate = edit && (!initial || time(edit.statusChangedAt) >= time(initial.statusChangedAt))
      ? edit : initial;
    if (!candidate) return product;
    const dbTime = time(product.statusChangedAt);
    const backupTime = time(candidate.statusChangedAt);
    if (backupTime < dbTime || (backupTime === dbTime && valid.has(product.lifecycleStatus)))
      return product;
    return { ...product, ...candidate };
  });
}

export function getBackupStatistics(storage = undefined) {
  storage = storageOrNull(storage);
  return { bulk: Object.keys(read(BASELINE_KEY,storage)).length,
    edits: Object.keys(read(CHANGE_KEY,storage)).length };
}
