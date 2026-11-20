import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {optimizedImageUrl, detectImageResizing} from '../public/image-delivery.js';
import {onRequestGet} from '../functions/api/image.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const manifest=JSON.parse(read('../public/catalog/manifest.json'));
const app=read('../public/app.js'), styles=read('../public/styles.css'),html=read('../public/index.html');
const imageSource='https://cdn.tgoapps.com/example.jpg';

test('final owner Excel: 19,096 priced items, 14,525 original images and 20 chunks',()=>{
 assert.equal(manifest.count,19096);
 assert.equal(manifest.withImages,14525);
 assert.equal(manifest.withoutStock,16460);
 assert.equal(manifest.withoutPrice,0);
 assert.equal(manifest.parts.length,20);
});
test('mobile main and subcategories show readable two-column photo cards',()=>{
 assert.match(styles,/@media\(max-width:679px\)/);
 assert.match(styles,/\.home-category-shortcuts,\.category-photo-grid,\.category-grid-page\{/);
 assert.match(styles,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(styles,/\.photo-category-name\{display:block!important/);
});
test('1D retail barcode decoding excludes QR and keeps external scanner input',()=>{
 assert.doesNotMatch(app,/['"]QR_CODE['"]/);
 assert.doesNotMatch(app,/['"]qr_code['"],/);
 assert.match(app,/saleBarcodeForm.*addEventListener/);
});
test('cart and saved sales retain brands without duplicate headings',()=>{
 assert.match(app,/sale-line-brand/);
 assert.match(app,/brandPrefix/);
 assert.match(app,/marka: line\.product\.marka/);
});
test('physical print size follows 58 or 80 mm and keeps receipt standalone',()=>{
 assert.match(app,/@page \{ size: \$\{mm\}mm \$\{height\}mm; margin: 0/);
 assert.match(html,/id="receiptPaperSize"/);
 assert.match(styles,/#receiptPrint\{box-sizing:border-box/);
});
test('image loader is view-dependent, max three concurrent, async decode and original fallback',()=>{
 const script=read('../public/image-delivery.js');
 assert.match(script,/MAX_PARALLEL=3/);
 assert.match(script,/new IntersectionObserver/);
 assert.match(script,/image\.decoding='async'/);
 assert.match(script,/image\.dataset\.originalRetry/);
 assert.match(app,/applyProductImage\(img,p\.gorsel,256\)/);
});
test('image resizing is disabled unless owner enables Pages variable',async()=>{
 const state=await onRequestGet({request:new Request('https://hizlisatis.pages.dev/api/image?status=1'),env:{}});
 assert.deepEqual(await state.json(),{enabled:false});
 const no=await onRequestGet({request:new Request('https://hizlisatis.pages.dev/api/image?w=256&url='+encodeURIComponent(imageSource)),env:{}});
 assert.equal(no.status,503);
 assert.equal(await detectImageResizing(async()=>new Response(JSON.stringify({enabled:false}),{status:200})),false);
 assert.equal(optimizedImageUrl(imageSource,256),imageSource);
});
test('resize endpoint rejects untrusted hosts, non-HTTPS, unsupported width',async()=>{
 for(const url of ['https://127.0.0.1/img.jpg','http://cdn.tgoapps.com/img.jpg','https://cdn.tgoapps.com.attacker.test/x.jpg']){
   const res=await onRequestGet({request:new Request('https://hizlisatis.pages.dev/api/image?w=256&url='+encodeURIComponent(url)),env:{ENABLE_IMAGE_RESIZE:'true'}});
   assert.equal(res.status,403);
 }
 const wrong=await onRequestGet({request:new Request('https://hizlisatis.pages.dev/api/image?w=700&url='+encodeURIComponent(imageSource)),env:{ENABLE_IMAGE_RESIZE:'true'}});
 assert.equal(wrong.status,400);
});
