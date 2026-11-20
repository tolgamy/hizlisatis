/** Offline, shareable PDF receipt. Text is rasterized so Turkish characters remain intact
 * without downloading external fonts. This is a sales information slip, not a fiscal receipt.
 */
const W = 595, H = 842, SCALE = 2;
const encoder = new TextEncoder();
const fmt = amount => new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
}).format(Number(amount) || 0);
const safe = value => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();
function bytes(data) { return typeof data === 'string' ? encoder.encode(data) : data; }
function pdfFromJpegs(images) {
  const totalObjects = 2 + images.length * 3;
  const kids = images.map((_, index) => (3 + index * 3) + ' 0 R').join(' ');
  const parts = []; const offsets = new Array(totalObjects + 1).fill(0);
  let length = 0;
  const push = data => { const value = bytes(data); parts.push(value); length += value.length; };
  push('%PDF-1.4\n');
  push(new Uint8Array([37, 226, 227, 207, 211, 10]));
  function object(number, content, binary) {
    offsets[number] = length;
    push(number + ' 0 obj\n' + content);
    if (binary) { push(binary); push('\nendstream'); }
    push('\nendobj\n');
  }
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [' + kids + '] /Count ' + images.length + ' >>');
  for (let index = 0; index < images.length; index++) {
    const image = images[index], pageId = 3 + index * 3;
    const imageId = pageId + 1, contentsId = pageId + 2;
    object(pageId, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H +
      '] /Resources << /XObject << /Im0 ' + imageId +
      ' 0 R >> >> /Contents ' + contentsId + ' 0 R >>');
    object(imageId, '<< /Type /XObject /Subtype /Image /Width ' + image.width +
      ' /Height ' + image.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 ' +
      '/Filter /DCTDecode /Length ' + image.data.length + ' >>\nstream\n', image.data);
    const commands = 'q\n' + W + ' 0 0 ' + H + ' 0 0 cm\n/Im0 Do\nQ\n';
    object(contentsId, '<< /Length ' + bytes(commands).length + ' >>\nstream\n' +
      commands + 'endstream');
  }
  const startxref = length;
  push('xref\n0 ' + (totalObjects + 1) + '\n0000000000 65535 f \n');
  for (let n = 1; n <= totalObjects; n++)
    push(String(offsets[n]).padStart(10, '0') + ' 00000 n \n');
  push('trailer\n<< /Size ' + (totalObjects + 1) +
    ' /Root 1 0 R >>\nstartxref\n' + startxref + '\n%%EOF');
  return new Blob(parts, { type: 'application/pdf' });
}
function splitLines(ctx, str, width) {
  const words = safe(str).split(/\s+/).filter(Boolean);
  const lines = []; let line = '';
  for (let word of words) {
    if (line && ctx.measureText(line + ' ' + word).width <= width) {
      line += ' ' + word; continue;
    }
    if (line) { lines.push(line); line = ''; }
    while (ctx.measureText(word).width > width && word.length > 1) {
      let cut = word.length - 1;
      while (cut > 1 && ctx.measureText(word.slice(0, cut)).width > width) cut--;
      lines.push(word.slice(0, cut)); word = word.slice(cut);
    }
    line = word;
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}
function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw Error('PDF çizimi için Canvas desteği gerekli.');
  ctx.scale(SCALE, SCALE);
  return { canvas, ctx };
}
function renderPage(ctx, page, pageNo, count, sale, groups, summary) {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const ink = '#182d43', muted = '#536579';
  function line(str, x, y, size = 11, bold = false, align = 'left', color = ink) {
    ctx.font = (bold ? '700 ' : '400 ') + size + 'px system-ui, Arial, sans-serif';
    ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(safe(str), x, y);
  }
  function rule(y) {
    ctx.strokeStyle = '#d9e1e8'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(40, y); ctx.lineTo(W - 40, y); ctx.stroke();
  }
  line('CEP HIZLI SATIŞ', 40, 58, 23, true);
  line('SATIŞ BİLGİ FİŞİ', W - 40, 56, 12, true, 'right');
  line('MALİ DEĞERİ YOKTUR', W - 40, 74, 9, false, 'right', '#a03b3b');
  rule(89);
  const date = new Date(sale.createdAt);
  const when = Number.isNaN(date.getTime()) ? '' :
    date.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  line('Fiş no: ' + safe(sale.id).slice(0, 38), 40, 113, 10);
  line('Tarih: ' + when, 40, 130, 10);
  line('Ödeme: ' + safe(sale.payment), 40, 147, 10);
  if (sale.creditName) line('Müşteri: ' + safe(sale.creditName).slice(0, 70), 40, 164, 10);
  rule(183);
  line('ÜRÜN / MİKTAR', 40, 200, 10, true, 'left', muted);
  line('TUTAR', W - 40, 200, 10, true, 'right', muted);
  let y = 220;
  for (const row of page) {
    line(row.name[0], 40, y, 11, true);
    for (let i = 1; i < row.name.length; i++)
      line(row.name[i], 40, y + i * 15, 11, true);
    const detailY = y + row.name.length * 15 + 2;
    line(row.detail, 40, detailY, 10, false, 'left', muted);
    line(row.total, W - 40, detailY, 11, true, 'right');
    y += row.height;
    rule(y - 8);
  }
  if (summary) {
    y += 15;
    const currency = safe(sale.currency || 'TRY');
    const amount = value => fmt(value) + ' ' + currency;
    const summaryLine = (label, value, highlight = false) => {
      line(label, 40, y, highlight ? 16 : 10, highlight);
      line(value, W - 40, y, highlight ? 16 : 10, highlight, 'right');
      y += highlight ? 29 : 20;
    };
    summaryLine('Ara toplam', amount(sale.base ?? sale.total));
    summaryLine('İskonto', '- ' + amount(sale.discount));
    for (const [rate, vat] of groups) summaryLine('Dahil KDV %' + rate, amount(vat));
    rule(y);
    y += 23;
    summaryLine('GENEL TOPLAM', amount(sale.total), true);
    if (sale.payment === 'Nakit') {
      summaryLine('Alınan', amount(sale.cashReceived));
      summaryLine('Para üstü', amount(sale.change));
    }
  }
  rule(H - 70);
  line('Bu belge mali fiş / fatura yerine geçmez.', 40, H - 49, 9, false, 'left', muted);
  line('Sayfa ' + pageNo + ' / ' + count, W - 40, H - 49, 9, false, 'right', muted);
}
function canvasJpeg(canvas) {
  const value = canvas.toDataURL('image/jpeg', 0.84);
  if (!value.startsWith('data:image/jpeg;base64,')) throw Error('PDF görseli oluşturulamadı.');
  const raw = atob(value.slice(value.indexOf(',') + 1));
  const data = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
  return { width: canvas.width, height: canvas.height, data };
}
/** Returns a real PDF Blob that can be shared as a file with Web Share API. */
export function receiptPdfBlob(sale) {
  if (!sale || !Array.isArray(sale.items) || !sale.items.length)
    throw Error('PDF için geçerli bir satış gerekli.');
  const { canvas, ctx } = makeCanvas();
  const currency = safe(sale.currency || 'TRY');
  ctx.font = '700 11px system-ui, Arial, sans-serif';
  const rows = sale.items.map(item => {
    const name = safe([item.marka, item.baslik].filter(Boolean).join(' · '));
    const extra = [item.beden, item.renk].filter(Boolean).join(' / ');
    const wrapped = splitLines(ctx, name + (extra ? ' (' + extra + ')' : ''), 485);
    return { name: wrapped,
      detail: safe(item.quantity) + ' × ' + fmt(item.unitPrice) +
        (item.discountPct ? ' · İskonto %' + item.discountPct : ''),
      total: fmt(item.total) + ' ' + currency,
      height: wrapped.length * 15 + 27 };
  });
  const vats = new Map();
  for (const item of sale.items) {
    const rate = Number(item.kdv) || 0;
    vats.set(rate, Math.round(((vats.get(rate) || 0) + (Number(item.vat) || 0)) * 100) / 100);
  }
  const groups = [...vats.entries()].sort((a, b) => a[0] - b[0]);
  const pages = []; let page = [], y = 220;
  for (const row of rows) {
    if (page.length && y + row.height > 635) {
      pages.push(page); page = []; y = 220;
    }
    page.push(row); y += row.height;
  }
  const summaryHeight = 130 + groups.length * 20 +
    (sale.payment === 'Nakit' ? 40 : 0);
  if (y + summaryHeight > H - 78 && page.length) {
    pages.push(page); page = [];
  }
  pages.push(page);
  const images = pages.map((items, index) => {
    renderPage(ctx, items, index + 1, pages.length, sale, groups, index === pages.length - 1);
    return canvasJpeg(canvas);
  });
  return pdfFromJpegs(images);
}
