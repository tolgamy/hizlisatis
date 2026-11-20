/** Small, dependency-free XLSX reader for modern mobile browsers.
 * Reads the "Urunler" worksheet, respecting shared/inline strings.
 * Only OOXML .xlsx is supported. ZIP decompression uses the native Streams API.
 */
const utf8 = new TextDecoder('utf-8');
const MAX_UNPACKED_ENTRY = 40 * 1024 * 1024;
const MAX_ROWS = 30000;

function parseXml(source, label) {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`${label} geçerli XML içermiyor.`);
  return doc;
}
function elements(parent, local) {
  return Array.from(parent.getElementsByTagName('*')).filter(n => n.localName === local);
}
function child(parent, local) {
  return Array.from(parent.children || []).find(n => n.localName === local) || null;
}
function text(node, key) { return child(node, key)?.textContent || ''; }
function colIndex(ref) {
  let n = 0;
  for (const char of (ref.match(/^[A-Z]+/) || [''])[0]) n = n * 26 + char.charCodeAt(0) - 64;
  return n - 1;
}
function safeZipPath(path) {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.split('/').includes('..')) throw new Error('Excel içinde geçersiz dosya yolu.');
  return normalized;
}
async function readZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  // Find end of central directory; the trailing ZIP comment is at most 65535 bytes.
  let eocd = -1;
  for (let pos = bytes.length - 22; pos >= Math.max(0, bytes.length - 65557); pos--) {
    if (view.getUint32(pos, true) === 0x06054b50) { eocd = pos; break; }
  }
  if (eocd < 0) throw new Error('Excel dosyası ZIP/XLSX biçiminde değil.');
  const count = view.getUint16(eocd + 10, true);
  const entries = new Map();
  let offset = view.getUint32(eocd + 16, true);
  if (count > 1000) throw new Error('Excel dosyası çok fazla parça içeriyor.');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error('Excel ZIP dizini bozuk.');
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameSize = view.getUint16(offset + 28, true);
    const extras = view.getUint16(offset + 30, true);
    const comment = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = safeZipPath(utf8.decode(bytes.slice(offset + 46, offset + 46 + nameSize)));
    entries.set(name, { method, compressed, size, local });
    offset += 46 + nameSize + extras + comment;
  }
  async function get(path) {
    const info = entries.get(path);
    if (!info) throw new Error(`Excel bileşeni bulunamadı: ${path}`);
    if (info.size > MAX_UNPACKED_ENTRY) throw new Error('Excel sayfası açılmak için fazla büyük.');
    const pos = info.local;
    if (pos + 30 > bytes.length || view.getUint32(pos, true) !== 0x04034b50)
      throw new Error('Excel ZIP girdisi hatalı.');
    const start = pos + 30 + view.getUint16(pos + 26, true) + view.getUint16(pos + 28, true);
    const end = start + info.compressed;
    if (end > bytes.length) throw new Error('Excel dosyası eksik.');
    const data = bytes.subarray(start, end);
    if (info.method === 0) return utf8.decode(data);
    if (info.method !== 8) throw new Error('Desteklenmeyen XLSX sıkıştırması.');
    if (typeof DecompressionStream !== 'function')
      throw new Error('Tarayıcınız Excel açmayı desteklemiyor. Güncel Chrome, Safari veya Edge kullanın.');
    let stream;
    try { stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')); }
    catch { throw new Error('Bu tarayıcı XLSX sıkıştırmasını açamıyor. Tarayıcıyı güncelleyin.'); }
    const chunks = await new Response(stream).arrayBuffer();
    if (chunks.byteLength > MAX_UNPACKED_ENTRY || chunks.byteLength !== info.size)
      throw new Error('Excel ZIP içeriği beklenenden farklı.');
    return utf8.decode(chunks);
  }
  return { get, has: name => entries.has(name) };
}
export async function readXlsxRows(file) {
  if (!file || !/\.xlsx$/i.test(file.name)) throw new Error('Lütfen .xlsx uzantılı Excel dosyası seçin.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Excel dosyası 12 MB sınırını aşıyor.');
  const zip = await readZip(await file.arrayBuffer());
  const wb = parseXml(await zip.get('xl/workbook.xml'), 'Çalışma kitabı');
  const sheets = elements(wb, 'sheet');
  const selected = sheets.find(s => s.getAttribute('name')?.toLocaleLowerCase('tr-TR') === 'urunler') || sheets[0];
  if (!selected) throw new Error('Excel çalışma sayfası bulunamadı.');
  const relId = selected.getAttribute('r:id') || selected.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (zip.has('xl/_rels/workbook.xml.rels')) {
    const relDoc = parseXml(await zip.get('xl/_rels/workbook.xml.rels'), 'Excel ilişkileri');
    const rel = elements(relDoc, 'Relationship').find(x => x.getAttribute('Id') === relId);
    if (rel) {
      const target = rel.getAttribute('Target') || '';
      sheetPath = safeZipPath(target.startsWith('/') ? target : 'xl/' + target);
    }
  }
  if (!zip.has(sheetPath) && zip.has('xl/worksheets/sheet1.xml')) sheetPath = 'xl/worksheets/sheet1.xml';
  const sheet = parseXml(await zip.get(sheetPath), 'Ürün sayfası');
  const shared = [];
  if (zip.has('xl/sharedStrings.xml')) {
    const doc = parseXml(await zip.get('xl/sharedStrings.xml'), 'Paylaşılan metinler');
    for (const si of elements(doc, 'si')) shared.push(elements(si, 't').map(x => x.textContent || '').join(''));
  }
  const lines = [];
  const cells = elements(sheet, 'sheetData')[0];
  if (!cells) throw new Error('Excel sayfası boş.');
  const rows = Array.from(cells.children).filter(x => x.localName === 'row');
  if (rows.length > MAX_ROWS + 40) throw new Error('Excel dosyası 30.000 satır sınırını aşıyor.');
  for (const row of rows) {
    const values = [];
    for (const cell of Array.from(row.children).filter(x => x.localName === 'c')) {
      const index = colIndex(cell.getAttribute('r') || 'A');
      if (index < 0 || index > 70) continue;
      const type = cell.getAttribute('t');
      let value = text(cell, 'v');
      if (type === 's') value = shared[Number(value)] ?? '';
      else if (type === 'inlineStr') value = elements(cell, 't').map(x => x.textContent || '').join('');
      else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE';
      values[index] = value;
    }
    if (values.some(v => v != null && String(v).trim())) lines.push(values);
  }
  return lines;
}