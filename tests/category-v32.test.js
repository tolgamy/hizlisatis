import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { MAIN_CATEGORY_ORDER, categoryArtwork, sortCategoryNodes } from '../public/category-art.js';
import { buildCategoryTree, categoryMatches, productCategoryPath, showCategoryInBrowse } from '../public/category-menu.js';

const source = file => readFileSync(new URL(file,import.meta.url),'utf8');
const rows = JSON.parse(source('../public/catalog/manifest.json'));
const readAll = () => rows.parts.flatMap(path => JSON.parse(source('../public' + path)));
const productRows = () => readAll().map(row => ({
  baslik: row[2], kategori: row[4], kategoriYolu: row[4].split(' > ')
}));
const ordered = [
  'Kasap', 'Manav', 'Fırından & Yiyecek', 'Süt Ürünleri & Kahvaltılık',
  'Atıştırmalık', 'Su ve İçecek', 'Dondurma', 'Temel Gıda',
  'Ev Bakım & Anne Bebek', 'Kişisel Bakım Ürünleri', 'Ev & Yaşam', 'PetShop'
];

test('owner-specified 12 main categories appear in fixed order', () => {
  assert.deepEqual(MAIN_CATEGORY_ORDER, ordered);
  const nodes = buildCategoryTree(productRows());
  assert.deepEqual(sortCategoryNodes(nodes).map(n=>n.name), ordered);
  assert.equal(nodes.reduce((sum,node)=>sum+node.count,0), 19096);
});

test('main tile images are local compressed WebP, with no text baked into images', () => {
  for(const category of MAIN_CATEGORY_ORDER) {
    const uri = categoryArtwork(category);
    assert.match(uri, /^\/category-images\/[\w-]+\.webp$/);
    const size = statSync(new URL('../public' + uri, import.meta.url)).size;
    assert.ok(size>2000 && size<25000, `${category}: ${size} bytes`);
  }
});

test('subcategories use lightweight SVG illustrations, never product photo URLs', () => {
  for(const category of [
    'Kasap > Kırmızı Et', 'Manav > Meyve',
    'Atıştırmalık > Çikolata', 'Dondurma > Külah Dondurmalar',
    'Su ve İçecek > Maden Suyu'
  ]) {
    const uri=categoryArtwork(category);
    assert.match(uri,/^data:image\/svg\+xml;charset=UTF-8,/);
    const graphic=decodeURIComponent(uri.split(',')[1]);
    assert.match(graphic,/<svg/);
    assert.doesNotMatch(graphic,/<image|<foreignObject|<script/);
  }
});

test('micro categories merge without changing raw sales catalog; irrelevant supplier basket group is hidden',()=>{
  assert.deepEqual(productCategoryPath({kategori:'Ev Bakım & Anne Bebek > Yaz Temizliği'}),['Ev Bakım & Anne Bebek','Ev Temizlik']);
  assert.deepEqual(productCategoryPath({kategori:'Ev Bakım & Anne Bebek > Toz - Sıvı Deterjanlar'}),['Ev Bakım & Anne Bebek','Çamaşır Yıkama']);
  assert.deepEqual(productCategoryPath({kategori:'Fırından & Yiyecek > Konserve'}),['Temel Gıda','Konserve & Turşu']);
  assert.ok(categoryMatches({kategori:'Su ve İçecek > Gazlı İçecek - Soda',baslik:'Avşar Maden Suyu'},'Su ve İçecek > Maden Suyu'));
  assert.equal(showCategoryInBrowse({path:'Ev & Yaşam > Toplu Sepetler',count:15}),false);
  assert.equal(showCategoryInBrowse({path:'Ev & Yaşam > Mutfak Ürünleri',count:30}),true);
});

test('home is only 12 picture tiles: no decorative controls or category names in cards',()=>{
  const html=source('../public/index.html'), app=source('../public/app.js');
  assert.doesNotMatch(html,/id="homeStartSale"|id="homeBrowse"|id="homeAllCategories"|id="homeCategories"/);
  assert.match(app,/target\.append\(categoryTile/);
  assert.match(app,/className = 'sr-only';/);
  assert.match(app,/sortCategoryNodes\(state\.categoryTreeData\)/);
});
