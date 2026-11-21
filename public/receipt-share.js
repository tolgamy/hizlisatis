/** POS information receipt: not a fiscal document. */
const fmt = x => new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(x)||0);
const clean = x => String(x??'').replace(/[\r\n\u0000-\u001f]/g,' ').trim();
export function receiptAsText(sale) {
 if (!sale || !Array.isArray(sale.items)) throw Error('Geçersiz satış');
 const date=new Date(sale.createdAt);
 const when=Number.isNaN(date.getTime())?'':date.toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'});
 const settings=sale.receiptSettings||{};
 const rows=[clean(settings.title)||'CEP HIZLI SATIŞ','MALI DEGERI YOKTUR',
 'Fis: '+clean(sale.id).slice(0,12)+' '+when,'Odeme: '+clean(sale.payment),'--------------------'];
 for (const item of sale.items) {
   rows.push(clean(item.baslik),String(item.quantity)+' x '+fmt(item.unitPrice)+' = '+fmt(item.total)+' '+(clean(sale.currency)||'TRY'));
 }
 rows.push('--------------------','TOPLAM: '+fmt(sale.total)+' '+(clean(sale.currency)||'TRY'));
 if (sale.payment==='Nakit') rows.push('Para ustu: '+fmt(sale.change)+' '+(clean(sale.currency)||'TRY'));
 rows.push('Tesekkur ederiz.');
 if(settings.phone)rows.push('Tel: '+clean(settings.phone));
 if(settings.website)rows.push(clean(settings.website));
 return rows.join('\n');
}
export function escPosReceipt(sale) {
 const plain=receiptAsText(sale).replace(/İ/g,'I').replace(/ı/g,'i')
 .replace(/Ğ/g,'G').replace(/ğ/g,'g').replace(/Ş/g,'S').replace(/ş/g,'s')
 .replace(/Ç/g,'C').replace(/ç/g,'c').replace(/Ö/g,'O').replace(/ö/g,'o')
 .replace(/Ü/g,'U').replace(/ü/g,'u').normalize('NFKD')
 .replace(/[\u0300-\u036f]/g,'').replace(/[^\x0A\x20-\x7E]/g,'?');
 const a=[0x1b,0x40],body=new TextEncoder().encode(plain+'\n\n\n'),tail=[0x1d,0x56,0x00];
 const bytes=new Uint8Array(a.length+body.length+tail.length);
 bytes.set(a);bytes.set(body,a.length);bytes.set(tail,a.length+body.length);return bytes;
}
