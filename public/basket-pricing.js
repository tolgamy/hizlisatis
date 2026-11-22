/** Money-safe allocation of a whole-cart percentage after line discounts.
 * Row totals are calculated by the checkout's existing lineTotals function;
 * line display totals stay unchanged and the basket discount is shown separately.
 */
const cents = value => Math.round((Number(value) + Number.EPSILON) * 100);
const money = value => value / 100;

export function parseBasketDiscountPercent(raw) {
  const value=String(raw??'').trim();
  if(!value)return 0;
  if(!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(value))
    throw Error('Sepet iskontosunu 0–100 arasında yüzde olarak girin.');
  const rate=Number(value.replace(',','.'));
  if(!Number.isFinite(rate)||rate<0||rate>100)
    throw Error('Sepet iskontosu %0 ile %100 arasında olmalı.');
  return rate;
}

export function calculateBasketTotals(rows, basketDiscountPct=0) {
  if(!Number.isFinite(basketDiscountPct)||basketDiscountPct<0||basketDiscountPct>100)
    throw RangeError('Geçersiz sepet iskontosu.');
  const parsed=rows.map(row=>{
    const base=cents(row.base),lineDiscount=cents(row.discounted),total=cents(row.total);
    const vatRate=Number(row.vatRate)||0;
    if(![base,lineDiscount,total,vatRate].every(Number.isFinite)||
       base<0||lineDiscount<0||total<0||vatRate<0||vatRate>100)
      throw Error('Sepette geçersiz fiyat veya vergi tutarı var.');
    return {base,lineDiscount,total,vatRate};
  });
  const baseCents=parsed.reduce((s,x)=>s+x.base,0);
  const lineDiscountCents=parsed.reduce((s,x)=>s+x.lineDiscount,0);
  const subtotalCents=parsed.reduce((s,x)=>s+x.total,0);
  const basketDiscountCents=Math.round(subtotalCents*basketDiscountPct/100);
  // Largest-remainder allocation ensures every cent of discount is recorded
  // exactly once, even across many lines with very small quantities.
  const assigned=parsed.map((row,index)=>{
    const exact=subtotalCents?basketDiscountCents*row.total/subtotalCents:0;
    const amount=Math.floor(exact);
    return {index,amount,fraction:exact-amount};
  });
  let remainder=basketDiscountCents-assigned.reduce((s,x)=>s+x.amount,0);
  const priority=[...assigned].sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
  for(let i=0;remainder>0&&i<priority.length;i++,remainder--)
    priority[i].amount++;
  const allocation=assigned.map(x=>x.amount);
  const allocations=parsed.map((row,i)=>{
    const basketDiscount=allocation[i],netCents=row.total-basketDiscount;
    const vat=Math.round(netCents*row.vatRate/(100+row.vatRate));
    return {basketDiscount:money(basketDiscount),netTotal:money(netCents),vat:money(vat)};
  });
  return {
    base:money(baseCents),lineDiscount:money(lineDiscountCents),
    subtotal:money(subtotalCents),basketDiscountPct,
    basketDiscount:money(basketDiscountCents),
    discount:money(lineDiscountCents+basketDiscountCents),
    total:money(subtotalCents-basketDiscountCents),
    vat:money(allocations.reduce((s,x)=>s+cents(x.vat),0)),
    allocations
  };
}
