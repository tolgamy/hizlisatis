import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAIN_CATEGORY_ORDER,categoryArtwork,categorySymbols} from '../public/category-art.js';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const css=read('styles.css'),app=read('app.js'),html=read('index.html');

test('all twelve approved main category pictures and names stay mapped, in original order',()=>{
  assert.equal(MAIN_CATEGORY_ORDER.length,12);
  for(const category of MAIN_CATEGORY_ORDER)
    assert.match(categoryArtwork(category),/^\/category-images\/[\w-]+\.webp$/);
  assert.match(app,/name\.textContent = node.name/);
  assert.match(app,/sortCategoryNodes\(state\.categoryTreeData\)/);
});
test('main tiles now show centered, readable category names in an adaptive 3x4 grid',()=>{
  assert.match(css,/#homeCategoryShortcuts\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(css,/#homeCategoryShortcuts \.photo-category-name\{[\s\S]*?display:-webkit-box!important/);
  assert.match(css,/#homeCategoryShortcuts \.photo-category-name\{[\s\S]*?font-size:clamp/);
  assert.match(css,/height:clamp\(58px,calc\(\(100dvh - 470px\)\/4\),90px\)/);
  assert.match(css,/#homeCategoryShortcuts \.photo-category-badge\{display:none!important\}/);
  assert.match(html,/Mobil POS · v3\.5\.1/);
});
test('subcategory icons render in real DOM on iPhone rather than inside SVG images',()=>{
  assert.match(app,/node\.path\.includes\(' > '\)/);
  assert.match(app,/categorySymbols\(node\.path\)/);
  assert.match(app,/symbols\.className = 'photo-category-symbols'/);
  assert.match(css,/#categoryTree \.photo-category-symbols\{/);
  assert.match(css,/#categoryTree \.photo-category-symbol\{/);
  for(const path of ['Manav > Meyve','Manav > Sebze','Kasap > Kırmızı Et',
    'Ev Bakım & Anne Bebek > Bulaşık','PetShop > Kedi Mamaları']){
    const symbols=categorySymbols(path);
    assert.ok(symbols.length>=2&&symbols.length<=3,path);
    const graphic=decodeURIComponent(categoryArtwork(path).split(',')[1]);
    assert.match(graphic,/<svg/);
    assert.doesNotMatch(graphic,/<text|<image|<foreignObject/);
  }
});
test('leaf category icons never incorrectly inherit matching parent words',()=>{
  assert.deepEqual(categorySymbols('Manav > Meyve'),['🍎','🍊','🍇']);
  assert.deepEqual(categorySymbols('Manav > Sebze'),['🥬','🥒','🥕']);
  assert.deepEqual(categorySymbols('Ev Bakım & Anne Bebek > Bulaşık'),['🍽️','🧽']);
  assert.deepEqual(categorySymbols('Kasap > Kırmızı Et'),['🥩','🍖']);
});
test('only category presentation files changed; product central persistence remains untouched',()=>{
  assert.match(app,/return categoryArtwork\(path\)/);
  assert.match(css,/#categoryTree \.photo-subcategory-image/);
  const sw=read('sw.js');assert.match(sw,/v25-category-labels-crisp-icons/);
});
