// Thermal driver must never infer landscape from a short 80 mm receipt.
export function portraitReceiptHeight(paperMm,contentMm){
 const width=Number(paperMm),height=Number(contentMm);
 if(!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<0)throw Error('Geçersiz fiş ölçüsü.');
 return Math.max(Math.ceil(width)+1,Math.ceil(height));
}
export function portraitReceiptPage(paperMm,contentMm){
 return '@page{size:'+paperMm+'mm '+portraitReceiptHeight(paperMm,contentMm)+'mm;margin:0}';
}
export function useNativeReceipt107(width,isDesktop,auto=false){
 return auto||(isDesktop&&(String(width)==='80'||String(width)==='58'));
}
