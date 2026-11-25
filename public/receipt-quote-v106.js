export const QUOTE_TITLE='HIZLI FİYAT TEKLİFİ';
export const QUOTE_FOOTER='MALİ DEĞERİ YOKTUR.\nBilgilendirme amaçlıdır.\nFiş veya fatura yerine geçmez.';
const clean=x=>String(x??'').replace(/[\r\n\t]+/g,' ').trim();
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(x)||0);
const qty=x=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:3}).format(Number(x)||0);
function title(prefs){const value=clean(prefs?.title);return !value||value==='CEP HIZLI SATIŞ'?QUOTE_TITLE:value;}
function name(item){const s=clean(item.baslik);const brand=clean(item.marka);const p=brand&&!s.toLocaleUpperCase('tr-TR').startsWith(brand.toLocaleUpperCase('tr-TR'))?brand+' '+s:s;return [p,item.beden,item.renk].map(clean).filter(Boolean).join(' ').toLocaleUpperCase('tr-TR');}
function quantity(item){const unit=clean(item.birim||'adet');return unit==='adet'||unit===''?('Adet: '+qty(item.quantity)):('Miktar: '+qty(item.quantity)+' '+unit);}
function money(sale,x){return num(x)+' '+(sale.currency==='TRY'||!sale.currency?'₺':clean(sale.currency));}
function time(sale){const date=new Date(sale.createdAt);return Number.isNaN(date.getTime())?'':date.toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'});}
function footer(prefs){return String(prefs?.footer||QUOTE_FOOTER).split(/\r?\n/).map(clean).filter(Boolean);}
function discounts(sale){const out=[];if(Number(sale.discount)>0||Number(sale.basketDiscount)>0){out.push(['Ara toplam',money(sale,sale.base)]);if(Number(sale.basketDiscount)>0){if(Number(sale.lineDiscount)>0)out.push(['Ürün indirimi','-'+money(sale,sale.lineDiscount)]);out.push(['Sepet indirimi','-'+money(sale,sale.basketDiscount)]);}else out.push(['İndirim','-'+money(sale,sale.discount)]);}return out;}
export function quoteModel(sale,prefs={}){
 const items=sale.items.map(item=>({name:name(item),metrics:[quantity(item),'Fiyat: '+num(item.unitPrice),'Toplam: '+num(item.total)]}));
 return {title:title(prefs),date:time(sale),items,discounts:discounts(sale),variety:items.length,totalQty:qty(sale.items.reduce((n,item)=>n+(Number(item.quantity)||0),0)),total:money(sale,sale.total),footer:footer(prefs)};
}
export function quoteMarkup(sale,prefs={},measure=(text,pt)=>text.length*pt*.73){
 const m=quoteModel(sale,prefs),width=75.5*96/25.4;
 const size=(text,pt,limit=width-5)=>Math.max(1,Math.min(pt,pt*limit/Math.max(1,measure(text,pt)))).toFixed(2);
 const rule='<div class="receipt-rule"></div>';
 const row=(a,b)=>'<div class="receipt-row"><span>'+esc(a)+'</span><span>'+esc(b)+'</span></div>';
 return '<div class="receipt-title" style="font-size:'+size(m.title,14)+'pt">'+esc(m.title)+'</div><div class="receipt-center receipt-small">'+esc(m.date)+'</div>'+rule+
 m.items.map(item=>'<div class="receipt-product"><div class="receipt-quote-name" style="font-size:'+size(item.name,10)+'pt">'+esc(item.name)+'</div><div class="receipt-quote-metrics" style="font-size:'+size(item.metrics.join('    '),9)+'pt">'+item.metrics.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div></div>'+rule).join('')+
 m.discounts.map(x=>row(...x)).join('')+row('Ürün çeşidi: '+m.variety,'Toplam adet: '+m.totalQty)+rule+
 '<div class="receipt-row receipt-grand" style="font-size:'+size('GENEL TOPLAM    '+m.total,12)+'pt"><span>GENEL TOPLAM</span><span>'+esc(m.total)+'</span></div>'+rule+
 m.footer.map((x,i)=>'<div class="receipt-center receipt-small'+(i===0?' receipt-quote-warning':'')+'">'+esc(x)+'</div>').join('');
}
export function quoteText(sale,prefs={}){
 const m=quoteModel(sale,prefs);
 return [m.title,m.date,'------------------------------------------',...m.items.flatMap(x=>[x.name,x.metrics.join('  '),'------------------------------------------']),...m.discounts.map(x=>x.join(': ')),'Ürün çeşidi: '+m.variety+'  Toplam adet: '+m.totalQty,'GENEL TOPLAM: '+m.total,...m.footer].join('\n');
}
