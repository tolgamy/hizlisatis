/** Read-only, device-timezone report filters for already loaded sales receipts.
 * No database mutations and no fabricated report values.
 */
export function localDateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = n => String(n).padStart(2,'0');
  return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());
}
export function quickReportRange(period, now = new Date()) {
  const end = new Date(now);
  end.setHours(0,0,0,0);
  const from = new Date(end);
  if (period === 'today') {}
  else if (period === 'yesterday') {from.setDate(from.getDate()-1);end.setDate(end.getDate()-1);}
  else if (period === '7') from.setDate(from.getDate()-6);
  else if (period === '30') from.setDate(from.getDate()-29);
  else if (period === 'month') from.setDate(1);
  else return {from:'',to:''};
  return {from:localDateKey(from),to:localDateKey(end)};
}
const fold = value => String(value ?? '').toLocaleLowerCase('tr-TR').trim();
export function filterReportSales(source, filters = {}) {
  const from = String(filters.from || '');
  const to = String(filters.to || '');
  if (from && to && from > to) throw Error('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
  const payment = String(filters.payment || '');
  const search = fold(filters.query);
  const min = filters.min === '' || filters.min == null ? null : Number(filters.min);
  const max = filters.max === '' || filters.max == null ? null : Number(filters.max);
  if ((min !== null && (!Number.isFinite(min) || min < 0)) ||
      (max !== null && (!Number.isFinite(max) || max < 0)) ||
      (min !== null && max !== null && min > max))
    throw Error('Tutar aralığını kontrol edin.');
  const filtered = (Array.isArray(source) ? source : []).filter(sale => {
    if (!sale || typeof sale !== 'object') return false;
    if (payment && sale.payment !== payment) return false;
    if (from || to) {
      const day = localDateKey(sale.createdAt);
      if (!day || (from && day < from) || (to && day > to)) return false;
    }
    const total = Number(sale.total);
    if ((min !== null || max !== null) && !Number.isFinite(total)) return false;
    if ((min !== null && total < min) || (max !== null && total > max)) return false;
    if (search) {
      const fields = [sale.id, sale.creditName, sale.payment];
      for (const item of Array.isArray(sale.items) ? sale.items : [])
        fields.push(item.baslik, item.barkod, item.urunKodu);
      if (!fold(fields.join(' ')).includes(search)) return false;
    }
    return true;
  });
  const sort = filters.sort || 'newest';
  filtered.sort((a,b) => {
    const byDate = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    if (sort === 'oldest') return -byDate || String(a.id || '').localeCompare(String(b.id || ''));
    if (sort === 'highest' || sort === 'lowest') {
      const diff = Number(b.total || 0) - Number(a.total || 0);
      return (sort === 'highest' ? diff : -diff) || byDate;
    }
    return byDate || String(b.id || '').localeCompare(String(a.id || ''));
  });
  return filtered;
}
