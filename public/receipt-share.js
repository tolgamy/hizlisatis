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
   const qty=item.birim==='kg'?
     new Intl.NumberFormat('tr-TR',{minimumFractionDigits:3,maximumFractionDigits:3}).format(Number(item.quantity))+' kg':
     item.birim==='g'?String(item.quantity)+' g':String(item.quantity);
   const per=item.birim==='kg'?'/kg':item.birim==='g'?'/g':'';
   rows.push(clean(item.baslik),qty+' x '+fmt(item.unitPrice)+per+' = '+fmt(item.total)+' '+(clean(sale.currency)||'TRY'));
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
 // ESC @ reset, ESC E 1 bold on, ESC 3 24 compact dot line spacing.
 // Bluetooth ESC/POS receipts should match the bold, compact 80/58 mm print.
 const a=[0x1b,0x40,0x1b,0x45,0x01,0x1b,0x33,0x18];
 const body=new TextEncoder().encode(plain+'\n\n');
 const tail=[0x1b,0x45,0x00,0x1d,0x56,0x00];
 const bytes=new Uint8Array(a.length+body.length+tail.length);
 bytes.set(a);bytes.set(body,a.length);bytes.set(tail,a.length+body.length);return bytes;
}
