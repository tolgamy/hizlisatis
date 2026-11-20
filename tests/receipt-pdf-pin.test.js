import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { receiptPdfBlob } from '../public/receipt-pdf.js';
import { verifyPassivePin } from '../public/passive-auth.js';

test('passive actions require exactly the selected 1453 PIN', () => {
  assert.equal(verifyPassivePin('1453'), true);
  assert.equal(verifyPassivePin(' 1453 '), true);
  for (const wrong of ['', '1234', 'PASİF', '0000', null, 1453])
    assert.equal(verifyPassivePin(wrong), false);
  const management = readFileSync(new URL('../public/product-management.js', import.meta.url), 'utf8');
  assert.match(management, /if\(!authorizePassiveAction\(\)\)return;/);
  assert.match(management, /action==='deactivate'&&!authorizePassiveAction\(\)\)return;/);
});

test('PDF creation works offline with Turkish receipt fields and a PDF cross-reference table', async () => {
  const ctx = {
    scale() {}, fillRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    measureText(value) { return { width: String(value).length * 6 }; }
  };
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        width: 0, height: 0,
        getContext() { return ctx; },
        toDataURL() { return 'data:image/jpeg;base64,/9j/2Q=='; }
      };
    }
  };
  try {
    const sale = {
      id:'sample-12345678',createdAt:'2026-11-21T10:00:00.000Z',payment:'Nakit',
      base:500,discount:10,total:490,cashReceived:500,change:10,currency:'TRY',
      items:Array.from({length:37}, (_, index) => ({
        baslik:'Örnek süt ürünü '+index,marka:'İçecek',quantity:1,
        unitPrice:500/37,total:490/37,discountPct:2,kdv:10,vat:2
      }))
    };
    const blob = receiptPdfBlob(sale);
    assert.equal(blob.type,'application/pdf');
    assert.ok(blob.size>1000);
    const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
    assert.ok(pdf.startsWith('%PDF-1.4'));
    const count = Number(pdf.match(/\/Count (\d+) >>/)?.[1]);
    assert.ok(count>1);
    assert.equal((pdf.match(/\/Subtype \/Image/g)||[]).length,count);
    assert.equal((pdf.match(/\nendstream\n/g)||[]).length,count*2);
    const xrefOffset = Number(pdf.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
    assert.equal(pdf.slice(xrefOffset,xrefOffset+5),'xref\n');
  } finally {
    globalThis.document = previousDocument;
  }
});

test('receipt UI retains WhatsApp and adds PDF file sharing separately', () => {
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(html,/id="receiptWhatsApp"/);
  assert.match(html,/id="receiptPdfShare"/);
  assert.match(app,/navigator\.canShare\?\.\(\{files:\[file\]\}\)/);
  assert.match(app,/navigator\.share\(\{files:\[file\],title:/);
  assert.match(app,/link\.download=fileName/);
});
