/** Shared, side-effect-free validation of central-sale receipts.
 * Money is checked in integer cents; never trust client-sent totals blindly.
 */
const UUID=/^[a-zA-Z0-9:_-]{8,100}$/;
const PAYMENT=new Set(['Nakit','Kart','Veresiye','Havale / FAST','Yemek Kartı','Diğer']);
const LIMIT=100_000_000_000; // cents
export const cents=value=>Math.round((Number(value)+Number.EPSILON)*100);
function validMoney(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&cents(value)<=LIMIT;}
export function validateCentralReceipt(record){
  if(!record||typeof record!=='object'||Array.isArray(record))throw Error('Satış fişi geçersiz.');
  if(typeof record.id!=='string'||!UUID.test(record.id))throw Error('Fiş numarası geçersiz.');
  if(typeof record.createdAt!=='string'||!Number.isFinite(Date.parse(record.createdAt))||
     record.createdAt.length>48)throw Error('Fiş tarihi geçersiz.');
  if(!PAYMENT.has(record.payment))throw Error('Ödeme yöntemi geçersiz.');
  if(record.currency!=='TRY')throw Error('Merkezi satışta yalnızca TRY destekleniyor.');
  if(!validMoney(record.total))throw Error('Fiş tutarı geçersiz.');
  if(!Array.isArray(record.items)||record.items.length<1||record.items.length>150)
    throw Error('Fişteki ürün sayısı geçersiz.');
  if(!Number.isFinite(record.basketDiscountPct??0)||record.basketDiscountPct<0||
     record.basketDiscountPct>100)throw Error('Sepet indirimi geçersiz.');
  let subtotal=0;
  const ids=[];
  let discounted=record.basketDiscountPct>0;
  for(const item of record.items){
    if(!item||typeof item.id!=='string'||!item.id||item.id.length>180||
      typeof item.quantity!=='number'||!Number.isFinite(item.quantity)||item.quantity<=0||
      item.quantity>100000||!validMoney(item.unitPrice)||
      !Number.isFinite(item.discountPct)||item.discountPct<0||item.discountPct>100)
      throw Error('Fişteki ürün veya fiyat geçersiz.');
    const base=cents(item.quantity*item.unitPrice);
    if(!Number.isSafeInteger(base)||base<0||base>LIMIT)throw Error('Fiş satırı tutarı geçersiz.');
    const lineDiscount=Math.round(base*item.discountPct/100);
    subtotal+=base-lineDiscount;
    ids.push(item.id);
    if(item.discountPct>0)discounted=true;
    if(!Number.isSafeInteger(subtotal)||subtotal>LIMIT)
      throw Error('Fiş toplamı sınırı aşıldı.');
  }
  const basketDiscount=Math.round(subtotal*(record.basketDiscountPct||0)/100);
  const expectedTotal=subtotal-basketDiscount;
  if(cents(record.total)!==expectedTotal)
    throw Error('Fiş toplamı ürün fiyatlarıyla uyuşmuyor.');
  const credit=record.payment==='Veresiye';
  if(credit&&(!record.creditCustomerId||!UUID.test(record.creditCustomerId)||
     !record.total))throw Error('Veresiye için müşteri ve pozitif tutar gerekli.');
  if(!credit&&record.creditCustomerId)throw Error('Veresiye dışı fişte müşteri borcu oluşturulamaz.');
  return {totalCents:expectedTotal,ids:[...new Set(ids)],discounted,credit,customerId:credit?record.creditCustomerId:null};
}
