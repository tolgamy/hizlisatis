/** Safe, device-aware arithmetic for the desktop Stock Status editor.
 * D1 owns the product's base stock; device sale adjustments remain untouched.
 * No global 99-stock reset or fabricated inventory is performed.
 */
const round3=x=>Math.round((x+Number.EPSILON)*1000)/1000;
const round2=x=>Math.round((x+Number.EPSILON)*100)/100;

export function sameProductRecord(original,current){
  if(!original||!current||original.id!==current.id)return false;
  const normalized=x=>JSON.stringify(Object.entries(x).sort(([a],[b])=>a<b?-1:a>b?1:0));
  return normalized(original)===normalized(current);
}

export function prepareStockEdit(product,{mode='add',quantity=0,soldQuantity=0,price=null}={}){
  if(!product||!product.id)throw Error('Ürün bulunamadı.');
  if(!Number.isFinite(soldQuantity)||soldQuantity<0)throw Error('Cihaz satış kayıtları geçersiz.');
  const updated={...product};
  if(mode==='add'){
    if(!Number.isFinite(quantity)||quantity<0||quantity>1e7||
      Math.abs(quantity*1000-Math.round(quantity*1000))>1e-6)
      throw Error('Eklenecek miktar geçersiz. En fazla 3 ondalık basamak kullanın.');
    if(quantity>0){
      if(product.stokBelirsiz||!Number.isFinite(Number(product.stok)))
        throw Error('Stok takibi bulunmuyor. Önce 99’a ayarlayın veya Ürün Yönetimi’nde başlangıç stoğu girin.');
      updated.stok=round3(Number(product.stok)+quantity);
      updated.stokBelirsiz=false;
    }
  }else if(mode==='set99'){
    // All-time device sales are still deducted by the existing stock display.
    // Set base accordingly so *this device's* visible remaining units are 99.
    updated.stok=round3(99+soldQuantity);
    updated.stokBelirsiz=false;
  }else throw Error('Stok işlemi geçersiz.');
  if(price!==null){
    if(!Number.isFinite(price)||price<0||price>1e9)
      throw Error('Satış fiyatı geçersiz.');
    const gross=round2(price);
    updated.satisFiyati=gross;
    updated.fiyatBelirsiz=false;
    // An existing tax-exclusive product must retain a consistent net edit value.
    const vat=Number(product.kdv)||0;
    updated.girisFiyati=product.kdvExcluded?round2(gross/(1+vat/100)):gross;
  }
  const stockChanged=updated.stok!==product.stok ||
    Boolean(updated.stokBelirsiz)!==Boolean(product.stokBelirsiz);
  const priceChanged=updated.satisFiyati!==product.satisFiyati ||
    Boolean(updated.fiyatBelirsiz)!==Boolean(product.fiyatBelirsiz);
  if(!stockChanged&&!priceChanged)
    throw Error('Kaydetmek için stok ekleyin, 99’a ayarlayın veya fiyatı değiştirin.');
  return updated;
}
