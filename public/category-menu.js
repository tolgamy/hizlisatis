/** Hierarchical category navigation, without altering catalogue or sales data. */
export function productCategoryPath(product) {
  const segments = Array.isArray(product?.kategoriYolu) && product.kategoriYolu.length
    ? product.kategoriYolu
    : String(product?.kategori || product?.kategoriAna || 'Diğer').split('>');
  const normalized = segments.map(x => String(x ?? '').trim()).filter(Boolean);
  return normalized.length ? normalized : ['Diğer'];
}
export function categoryMatches(product, selected) {
  const match = String(selected || '').trim();
  if (!match) return true;
  const path = productCategoryPath(product).join(' > ');
  return path === match || path.startsWith(`${match} > `);
}
export function buildCategoryTree(products) {
  const roots = [], lookup = new Map();
  for (const product of products || []) {
    let path = '', children = roots;
    for (const name of productCategoryPath(product)) {
      path = path ? `${path} > ${name}` : name;
      let node = lookup.get(path);
      if (!node) {
        node = { name, path, count: 0, children: [] };
        lookup.set(path, node); children.push(node);
      }
      node.count++; children = node.children;
    }
  }
  const sort = nodes => { nodes.sort((a,b) => a.name.localeCompare(b.name, 'tr')); for (const n of nodes) sort(n.children); };
  sort(roots);
  return roots;
}
