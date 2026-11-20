/** Pure helpers for website-style hierarchical POS catalogue browsing.
 * Legacy Excel category strings are preserved on the product record. The
 * storefront projection safely combines obvious duplicates without deleting
 * or modifying product, barcode, sale or stock records.
 */
const CATEGORY_MERGES = new Map([
  ['Ev Bakım & Anne Bebek > Toz - Sıvı Deterjanlar', 'Ev Bakım & Anne Bebek > Çamaşır Yıkama'],
  ['Ev Bakım & Anne Bebek > Yaz Temizliği', 'Ev Bakım & Anne Bebek > Ev Temizlik'],
  ['Fırından & Yiyecek > Yiyecek - Sandviç', 'Fırından & Yiyecek > Hazır Yemek'],
  ['Fırından & Yiyecek > Konserve', 'Temel Gıda > Konserve & Turşu']
]);
export const HIDDEN_BROWSE_PATHS = new Set(['Ev & Yaşam > Toplu Sepetler']);
export function showCategoryInBrowse(node) {
  return node?.count > 0 && !HIDDEN_BROWSE_PATHS.has(node.path);
}
export function productCategoryPath(product) {
  const segments = Array.isArray(product?.kategoriYolu) && product.kategoriYolu.length
    ? product.kategoriYolu
    : String(product?.kategori || product?.kategoriAna || 'Diğer').split('>');
  const normalized = segments.map(x => String(x ?? '').trim()).filter(Boolean);
  if (!normalized.length) return ['Diğer'];
  const path = normalized.join(' > ');
  if (path === 'Su ve İçecek > Gazlı İçecek - Soda') {
    const label = String(product?.baslik || '').toLocaleLowerCase('tr-TR');
    return ['Su ve İçecek', /maden suyu/.test(label) ? 'Maden Suyu' : 'Gazlı İçecek'];
  }
  return (CATEGORY_MERGES.get(path) || path).split(' > ');
}

export function categoryMatches(product, selected) {
  const match = String(selected || '').trim();
  if (!match) return true;
  const path = productCategoryPath(product).join(' > ');
  return path === match || path.startsWith(`${match} > `);
}

/** Count sellable variants in each category and its ancestors. */
export function buildCategoryTree(products) {
  const roots = [];
  const lookup = new Map();
  for (const product of products || []) {
    let path = '', children = roots;
    for (const name of productCategoryPath(product)) {
      path = path ? `${path} > ${name}` : name;
      let node = lookup.get(path);
      if (!node) {
        node = { name, path, count: 0, children: [] };
        lookup.set(path, node);
        children.push(node);
      }
      node.count += 1;
      children = node.children;
    }
  }
  const sort = nodes => {
    nodes.sort((a,b) => a.name.localeCompare(b.name, 'tr'));
    for (const node of nodes) sort(node.children);
  };
  sort(roots);
  return roots;
}
