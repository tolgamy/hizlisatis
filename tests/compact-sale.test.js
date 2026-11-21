import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const saleHtml = html.slice(html.indexOf('<dialog id="cartDialog"'), html.indexOf('<dialog id="productDetailDialog"'));
const cartRenderer = app.slice(app.indexOf('function renderCart() {'), app.indexOf('function updatePayment() {'));

test('minimal checkout has only a compact header, barcode input, cart, total, payment, confirm', () => {
  for (const id of ['saleBarcode','saleScanButton','cartItems','cartTotals','completeSale',
    'creditName','creditCustomerSearch','saleQuickHome','saleQuickProducts','saleQuickSettings']) {
    assert.match(saleHtml, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(saleHtml, /id="cashOption"|id="receiptWidth"|sale-eyebrow|sale-count-strip|Merkezi POS/);
  assert.match(saleHtml, /<legend class="sr-only">Ödeme türü/);
});
test('item price and discount remain accessible on demand while stock editing remains', () => {
  assert.match(cartRenderer, /<details class="sale-line-more">/);
  assert.match(cartRenderer, /data-field="price"/);
  assert.match(cartRenderer, /data-field="discount"/);
  assert.match(cartRenderer, /data-field="quantity"/);
  assert.match(cartRenderer, /data-step="-1"/);
  assert.match(cartRenderer, /data-step="1"/);
  assert.match(cartRenderer, /data-remove/);
  assert.doesNotMatch(cartRenderer, /<span>Ara toplam<\/span>|<span>Dahil olan KDV<\/span>|Satır toplamı:/);
  assert.match(styles, /\.sale-sheet\[open\]\{display:flex/);
});
test('cash payment is a separate amount-and-change dialog', () => {
  assert.match(app,/function openCashPayment\(/);
  assert.match(app,/cashPayTotal/);
  assert.match(app,/Alınan tutarı girin/);
  assert.match(app,/cashConfirm/);
  assert.match(html,/id="cashPaymentDialog"/);
});
