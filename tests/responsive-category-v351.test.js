import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAIN_CATEGORY_ORDER,categoryArtwork} from '../public/category-art.js';
const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('styles.css'),app=read('app.js'),html=read('index.html');
const manager=read('product-management.js');

test('twelve main category pictures and names stay mapped and in original order',()=>{
  assert.equal(MAIN_CATEGORY_ORDER.length,12);
  for(const category of MAIN_CATEGORY_ORDER)
    assert.match(categoryArtwork(category),/^\/category-images\/[\w-]+\.webp$/);
  assert.match(app,/name\.textContent = node.name/);
  assert.match(app,/sortCategoryNodes\(state\.categoryTreeData\)/);
});
test('home displays 3x4 slightly larger visual tiles with legible text',()=>{
  assert.match(css,/#homeCategoryShortcuts\{/);
  assert.match(css,/#homeCategoryShortcuts \.photo-category-image\{/);
  assert.match(css,/height:clamp\(75px,calc\(\(100dvh - 435px\)\/4\),108px\)/);
  assert.match(css,/transform:scale\(1\.19\)/);
  assert.match(css,/#homeCategoryShortcuts \.photo-category-name\{/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(html,/<strong>Hızlı<span>Satış<\/span><\/strong>/);
});
test('subcategory cards are three columns with original native vector category art, no emoji collages',()=>{
  assert.match(css,/#categoryTree\.category-grid-page\{/);
  assert.match(css,/#categoryTree \.photo-subcategory-image>img\{/);
  assert.match(css,/#categoryTree \.photo-category-symbols\{display:none!important\}/);
  assert.doesNotMatch(app,/symbols\.className = 'photo-category-symbols'/);
  for(const path of ['Manav > Meyve','Manav > Sebze','Kasap > Kırmızı Et',
    'Ev Bakım & Anne Bebek > Bulaşık','PetShop > Kedi Mamaları']){
    const uri=categoryArtwork(path);
    assert.match(uri,/^data:image\/svg\+xml;charset=UTF-8,/);
    const svg=decodeURIComponent(uri.split(',')[1]);
    assert.match(svg,/<svg/);
    assert.match(svg,/<path/);
    assert.doesNotMatch(svg,/<text|<image|<foreignObject|<script/);
  }
  assert.notEqual(categoryArtwork('Manav > Sebze'),categoryArtwork('Manav > Meyve'));
});
test('passive statuses open a hierarchical 12-main, subcategory product navigation',()=>{
  for(const id of ['manageCategoryBrowser','manageCategoryGrid','manageCategoryBack'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(manager,/function drawCategoryNavigation\(products\)/);
  assert.match(manager,/filter==='initial-inactive'\|\|filter==='later-inactive'/);
  assert.match(manager,/MAIN_CATEGORY_ORDER\.map\(name/);
  assert.match(manager,/productCategoryPath\(product\)/);
  assert.match(manager,/if\(manageCategoryRoot\)manageCategorySub=choice\.name/);
  assert.match(manager,/if\(isPassiveList\(\)&&manageCategoryRoot\)/);
  assert.match(manager,/offerManualActivation\(product\)/);
  assert.match(manager,/if\(!\(product\.lifecycleStatus==='active'&&isPassiveList\(\)\)\)/);
});
test('receipt title phone website and printer width require visible Save confirmation',()=>{
  for(const id of ['settingsReceiptSave','settingsReceiptStatus','settingsReceiptTitle','settingsReceiptPhone',
    'settingsReceiptWebsite','settingsPrintWidth'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(app,/settingsSaveButton\.addEventListener\('click'/);
  assert.match(app,/saveReceiptSettings\(data\)/);
  assert.match(app,/readReceiptSettings\(\)/);
  assert.match(app,/✓ Fiş ve firma bilgileri kaydedildi/);
  assert.match(app,/Kaydedilmemiş değişiklikler var/);
});
test('new PWA shell includes category icons and revokes old version cache',()=>{
  const sw=read('sw.js');
  assert.match(sw,/v41-settings-2x4-product-photos/);
  assert.match(sw,/\/subcategory-icons\.js/);
});

test('category browser can reveal every inactive product beyond the first 40, without resets on activation',()=>{
  assert.match(manager,/manageVisibleLimit=40/);
  assert.match(manager,/matching\.slice\(0,manageVisibleLimit\)/);
  assert.match(manager,/manageVisibleLimit\+=60/);
  assert.match(manager,/Daha Fazla Ürün Göster/);
  assert.match(css,/\.manage-results \.manage-more-button/);
});
