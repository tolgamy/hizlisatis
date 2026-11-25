import {upper,originText} from './product-origin-v99.js';
import {autoPrint,sendPrint} from './local-print-v99.js';
import {addQueuedLabel} from './label-queue-v99.js';
import {readPrinterProfiles} from './printer-profiles-v99.js';
import {pdfFromLabelJpeg} from './argox-pdf-v99.js';
// v99: Accurate -90° canvas placement and native 38x100mm PDF printing with no browser headers.

const CODE128_PATTERNS=[
"212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212",
"112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131",
"311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321",
"112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121",
"313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
"314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114",
"122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212",
"124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113",
"114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"
];
const EAN_L=["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const EAN_G=["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const EAN_R=["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const EAN_PARITY=["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];
function escapeLabelHtml(input){
  return String(input??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function eanCheckDigit(code){
  const digits=String(code).split('').map(Number);
  const sum=digits.reduce((n,d,i)=>n+d*((digits.length-1-i)%2===0?3:1),0);
  return String((10-(sum%10))%10);
}
function makeEan13Bars(code){
  if(!/^\d{13}$/.test(code)||eanCheckDigit(code.slice(0,12))!==code[12])return null;
  const parity=EAN_PARITY[Number(code[0])];
  let bits='101';
  for(let i=1;i<=6;i++)bits+=(parity[i-1]==='G'?EAN_G:EAN_L)[Number(code[i])];
  bits+='01010';
  for(let i=7;i<13;i++)bits+=EAN_R[Number(code[i])];
  return bits+'101';
}
function makeEan8Bars(code){
  if(!/^\d{8}$/.test(code)||eanCheckDigit(code.slice(0,7))!==code[7])return null;
  let bits='101';for(let i=0;i<4;i++)bits+=EAN_L[Number(code[i])];
  bits+='01010';for(let i=4;i<8;i++)bits+=EAN_R[Number(code[i])];
  return bits+'101';
}
function code128Codes(raw){
  const text=String(raw??'');
  if(!text||text.length>40||![...text].every(ch=>{const n=ch.charCodeAt(0);return n>=32&&n<=126;}))
    throw Error('Barkod yazdırma için 1–40 karakterlik ASCII kodu gereklidir.');
  let i=0,mode=/^\d{4}/.test(text)?'C':'B';
  const codes=[mode==='C'?105:104];
  while(i<text.length){
    const numeric=(text.slice(i).match(/^\d+/)||[''])[0].length;
    if(mode==='C'){
      if(numeric>=2){codes.push(Number(text.slice(i,i+2)));i+=2;continue;}
      codes.push(100);mode='B';continue;
    }
    if(numeric>=4){
      codes.push(99);mode='C';continue;
    }
    codes.push(text.charCodeAt(i)-32);i++;
  }
  const weighted=codes.reduce((sum,n,j)=>sum+(j===0?n:n*j),0);
  codes.push(weighted%103,106);
  return codes;
}
function barcodeSvg(value){
  const code=String(value??'').trim();
  if(!code)throw Error('Barkod numarası bulunamadı.');
  const ean13=makeEan13Bars(code);
  const ean8=makeEan8Bars(code);
  let bits=ean13||ean8;
  if(!bits&&/^\d{12}$/.test(code))bits=makeEan13Bars('0'+code);
  if(bits){
    const quiet=11,h=55;
    const stripes=[];for(let i=0;i<bits.length;i++)if(bits[i]==='1')stripes.push('<rect x="'+(quiet+i)+'" y="0" width="1" height="'+h+'"/>');
    const w=quiet*2+bits.length;
    return '<svg class="pl-barcode" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Barkod '+escapeLabelHtml(code)+'" viewBox="0 0 '+w+' 68" preserveAspectRatio="none"><g fill="#000">'+stripes.join('')+'</g><text x="'+(w/2)+'" y="66" font-family="Arial,sans-serif" font-size="9" fill="#000" text-anchor="middle">'+escapeLabelHtml(code)+'</text></svg>';
  }
  const codes=code128Codes(code),quiet=12;
  let x=quiet;const stripes=[];
  for(const n of codes){
    const pat=CODE128_PATTERNS[n];if(!pat)throw Error('Barkod üretilemedi.');
    for(let i=0;i<pat.length;i++){
      const w=Number(pat[i]);if(i%2===0)stripes.push('<rect x="'+x+'" y="0" width="'+w+'" height="55"/>');
      x+=w;
    }
  }
  const w=x+quiet;
  return '<svg class="pl-barcode" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Barkod '+escapeLabelHtml(code)+'" viewBox="0 0 '+w+' 68" preserveAspectRatio="none"><g fill="#000">'+stripes.join('')+'</g><text x="'+w/2+'" y="66" font-family="Arial,sans-serif" font-size="10" fill="#000" text-anchor="middle">'+escapeLabelHtml(code)+'</text></svg>';
}
function labelPrice(product){
  const amount=Number(product?.satisFiyati);
  if(product?.fiyatBelirsiz||product?.satisFiyati==null||!Number.isFinite(amount)||amount<0)return null;
  return amount;
}
function priceText(amount){
  return new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(amount);
}
function labelOrigin106(product){
 const origin=originText(product);
 return origin==='YERLİ ÜRETİM'?origin:origin.startsWith('MENŞEİ: ')?origin.slice(8):'';
}
function labelMarkup(product){
 const price=labelPrice(product);if(price===null)throw Error('Bu ürünün satış fiyatı tanımlı değil.');
 const code=String(product.barkod||product.urunKodu||'').trim(),unit=escapeLabelHtml(product.birim||'adet');
 const origin=labelOrigin106(product);
 return '<div class="pl-paper"><article class="pl-ticket"><div class="pl-ticket-market">USMAR MARKET</div><div class="pl-ticket-name">'+escapeLabelHtml(upper(product.baslik||'Ürün'))+'</div><div class="pl-ticket-price">'+priceText(price)+'<small> ₺</small></div><div class="pl-ticket-unit">Birim fiyat: '+priceText(price)+' ₺ / '+unit+'</div><div class="pl-ticket-barcode">'+barcodeSvg(code)+'</div>'+(origin?'<div class="pl-ticket-origin">'+escapeLabelHtml(origin)+'</div>':'')+'</article></div>';
}

// Argox prints each 38x100mm yellow die-cut label as a separate portrait page.
// Rasterize the sideways artwork before printing to avoid Chromium pagination
// of transformed 100x38mm HTML boxes. Transparent pixels expose yellow paper.
function renderLabelImage(product,canvasFactory,opaque=false){
  const price=labelPrice(product);
  if(price===null)throw Error('Bu ürünün satış fiyatı tanımlı değil.');
  const code=String(product.barkod||product.urunKodu||'').trim();
  if(!code)throw Error('Barkod numarası bulunamadı.');
  const canvas=canvasFactory?canvasFactory():document.createElement('canvas');
  const k=8,W=100*k,H=38*k;
  canvas.width=H;canvas.height=W;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Etiket görseli oluşturulamadı.');
  ctx.save();
  if(opaque){ctx.fillStyle='#fff';ctx.fillRect(0,0,H,W);}
  // -90 degrees maps (x,y) to (y,W-x), inside the 304x800 canvas.
  ctx.translate(0,W);ctx.rotate(-Math.PI/2);
  ctx.fillStyle='#000';ctx.textBaseline='alphabetic';
  ctx.fillRect(20,15,760,51);
  ctx.save();
  if(opaque)ctx.fillStyle='#fff';else ctx.globalCompositeOperation='destination-out';
  ctx.font='900 36px Arial,sans-serif';ctx.textAlign='center';
  ctx.fillText('USMAR MARKET',400,51);ctx.restore();
  ctx.textAlign='left';ctx.fillStyle='#000';
  const title=upper(product.baslik||'Ürün');
  // Two full-width lines, independent of price/barcode; never discard letters.
  const words=title.split(/\s+/);
  let fontSize=31,lines=[];
  function wrap(){
    const out=[];let line='';
    for(const word of words){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>730){out.push(line);line=word;}else line=next;}
    if(line)out.push(line);return out;
  }
  do{ctx.font='900 '+fontSize+'px Arial,sans-serif';lines=wrap();if(lines.length<=2&&lines.every(x=>ctx.measureText(x).width<=730))break;fontSize--;}while(fontSize>=14);
  if(lines.length>2){const split=Math.ceil(words.length/2);lines=[words.slice(0,split).join(' '),words.slice(split).join(' ')];}
  ctx.font='900 '+Math.max(14,fontSize)+'px Arial,sans-serif';
  lines.slice(0,2).forEach((value,i)=>ctx.fillText(value,32,99+i*33,736));
  const priceLabel=priceText(price)+' ₺';
  let size=73;ctx.font='900 '+size+'px Arial,sans-serif';
  while(ctx.measureText(priceLabel).width>405&&size>20){size--;ctx.font='900 '+size+'px Arial,sans-serif';}
  ctx.textAlign='center';ctx.fillText(priceLabel,566,214,405);
  ctx.font='17px Arial,sans-serif';
  ctx.fillText('Birim fiyat: '+priceText(price)+' ₺ / '+String(product.birim||'adet'),566,241,410);
  const origin=labelOrigin106(product);
  if(origin){ctx.strokeRect(452,255,228,36);ctx.font='900 20px Arial,sans-serif';ctx.fillText(origin,566,279,210);}
  let bits=makeEan13Bars(code)||makeEan8Bars(code);
  if(!bits&&/^\d{12}$/.test(code))bits=makeEan13Bars('0'+code);
  if(!bits){
    bits='';
    for(const n of code128Codes(code)){
      const pat=CODE128_PATTERNS[n];
      for(let i=0;i<pat.length;i++)bits+=(i%2===0?'1':'0').repeat(Number(pat[i]));
    }
  }
  const quiet=11,x=25,y=163,width=320,modules=bits.length+quiet*2,step=width/modules;
  for(let i=0;i<bits.length;i++)if(bits[i]==='1')
    ctx.fillRect(x+Math.round((quiet+i)*step),y,Math.max(1,Math.round((quiet+i+1)*step)-Math.round((quiet+i)*step)),(bits.length===95&&(i<3||(i>=45&&i<50)||i>=92))?106:94);
  ctx.textAlign='center';ctx.font='17px Arial,sans-serif';
  const displayCode=makeEan13Bars(code)?code[0]+' '+code.slice(1,7)+' '+code.slice(7):code;
  ctx.fillText(displayCode,x+width/2,287,width);
  ctx.restore();
  if(typeof ctx.getImageData==='function'){
    const pixels=ctx.getImageData(0,0,H,W).data;
    let ink=0;
    for(let i=0;i<pixels.length;i+=4){
      if(pixels[i+3]>128&&pixels[i]<100&&pixels[i+1]<100&&pixels[i+2]<100)ink++;
    }
    if(ink<100)throw Error('Etiket boş oluşturuldu; baskı iptal edildi.');
  }
  return opaque?canvas.toDataURL('image/jpeg',.98):canvas.toDataURL('image/png');
}
// Exactly one page for count=1. Never include a break after the final label.
function printableHtml(product,count,image=undefined){
  const copies=Math.max(1,Math.min(50,Math.trunc(Number(count)||1)));
  const png=image||renderLabelImage(product);
  if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png))
    throw Error('Etiket görseli geçerli bir PNG olmalıdır.');
  const labels=Array.from({length:copies},()=>'<div class="pl-printed-label"><img width="304" height="800" alt="USMAR MARKET raf etiketi" src="'+png+'"></div>').join('');
  const style=[
    '@page{size:38mm 100mm;margin:0}',
    '*{box-sizing:border-box}',
    'html,body{margin:0!important;padding:0!important;border:0!important;width:38mm;background:#fff}',
    '.pl-printed-label{position:relative;display:block;width:38mm;height:99mm;margin:0!important;padding:0!important;border:0!important;overflow:hidden;break-inside:avoid;page-break-inside:avoid}',
    '.pl-printed-label+ .pl-printed-label{break-before:page;page-break-before:always}',
    '.pl-printed-label img{position:absolute;display:block;left:.19mm;top:.4mm;width:37.62mm;height:99mm;object-fit:fill;border:0}',
    '@media screen{body{background:#edf0f6}.pl-printed-label{background:white;margin:0 auto 12px!important}}'
  ].join('');
  return '<!doctype html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>USMAR MARKET Raf Etiketi</title><style>'+style+'</style></head><body>'+labels+'</body></html>';
}
function labelPdfBlob(product,count,canvasFactory){
  if(!Number.isInteger(count)||count<1||count>20)throw Error('Bir baskıda en fazla 20 etiket.');
  return pdfFromLabelJpeg(renderLabelImage(product,canvasFactory,true),count);
}
function createPriceLabelFeature({getProducts,findBarcode,openCamera,onCreateProduct,onEditProduct,notify}){
  const $=id=>document.getElementById(id);
  const dialog=$('priceLabelDialog'),missing=$('priceLabelMissingDialog');
  const input=$('priceLabelInput'),list=$('priceLabelMatches');
  const result=$('priceLabelResult'),paper=$('priceLabelTicketPreview');
  const status=$('priceLabelStatus'),printButton=$('priceLabelPrint');
  let selected=null,pending='',typingTimer=null;
  const clearResults=()=>{
    selected=null;$('priceLabelQueueFeedback').hidden=true;list.replaceChildren();result.hidden=true;paper.replaceChildren();printButton.disabled=true;
  };
  const showResult=product=>{
    selected=product;list.replaceChildren();$('priceLabelPreviewDetails').open=false;$('priceLabelQueueFeedback').hidden=true;
    $('priceLabelName').textContent=product.baslik||'Ürün';
    $('priceLabelCode').textContent='Barkod: '+(product.barkod||product.urunKodu||'Yok');
    const price=labelPrice(product);
    $('priceLabelPrice').textContent=price===null?'Fiyat belirtilmemiş':priceText(price)+' ₺';
    result.hidden=false;
    try{
      const preview=document.createElement('img');
      preview.className='pl-label-image';
      preview.alt='USMAR MARKET 38 × 100 mm etiket önizlemesi';
      preview.src=renderLabelImage(product);
      paper.replaceChildren(preview);
      printButton.disabled=false;
      status.textContent='Ürün bulundu.';
    }catch(error){
      paper.replaceChildren();printButton.disabled=true;
      status.textContent=error.message;
    }
  };
  const showMissing=code=>{
    clearResults();pending=code;
    $('priceLabelMissingBarcode').textContent='Barkod: '+code;
    if(!missing.open)missing.showModal();
    status.textContent='Bu barkodla kayıtlı ürün bulunamadı.';
  };
  const search=(raw,barcodeOnly=false)=>{
    clearTimeout(typingTimer);
    const code=String(raw??'').trim();
    if(!code){clearResults();status.textContent='Barkod okutun veya ürün adı yazın.';return;}
    const exact=findBarcode(code);
    if(exact){showResult(exact);return;}
    const isBarcode=barcodeOnly||/^\d{6,24}$/.test(code)||
      /^(?=.*[0-9])[A-Za-z0-9._-]{6,64}$/.test(code);
    if(isBarcode){showMissing(code);return;}
    const query=code.toLocaleLowerCase('tr-TR');
    const items=getProducts().filter(p=>[p.baslik,p.marka,p.urunKodu,p.barkod].some(v=>
      String(v||'').toLocaleLowerCase('tr-TR').includes(query))).slice(0,12);
    if(!items.length){clearResults();status.textContent='Bu isimle eşleşen ürün bulunamadı.';return;}
    status.textContent='Listeden ürünü seçin.';
    for(const p of items){
      const button=document.createElement('button');
      button.type='button';button.className='pl-match';
      const name=document.createElement('strong');name.textContent=p.baslik||'Ürün';
      const small=document.createElement('span');small.textContent=p.barkod||p.urunKodu||'Barkod yok';
      button.append(name,small);button.addEventListener('click',()=>{
        input.value=p.barkod||p.urunKodu||p.baslik||'';
        showResult(p);
      });list.append(button);
    }
  };
  const open=()=>{
    if(!dialog.open)dialog.showModal();
    if(!input.value.trim())status.textContent='Barkod okutun veya ürün adı yazın.';
  };
  const clear=()=>{
    clearResults();pending='';input.value='';status.textContent='Yeni barkod okutmaya hazır.';
    if(!dialog.open)dialog.showModal();
    input.focus({preventScroll:true});
  };
  const acceptScan=code=>{
    if(!dialog.open)dialog.showModal();
    input.value=String(code??'');
    search(input.value,true);
  };
  $('homeQuickPriceLabel').addEventListener('click',()=>{
    open();
    input.focus({preventScroll:true});input.select();
  });
  $('priceLabelScan').addEventListener('click',()=>{
    if(dialog.open)dialog.close();openCamera();
  });
  $('priceLabelClose').addEventListener('click',()=>{if(dialog.open)dialog.close();clearResults();input.value='';});
  $('priceLabelClear').addEventListener('click',clear);
  $('priceLabelForm').addEventListener('submit',event=>{event.preventDefault();search(input.value);});
  input.addEventListener('keydown',event=>{
    if(event.key==='Tab'&&/^\d{8,14}$/.test(input.value.trim())){
      event.preventDefault();search(input.value,true);
    }
  });
  input.addEventListener('input',()=>{
    clearTimeout(typingTimer);
    const code=input.value.trim();
    if(/^(?:\d{8}|\d{12,14})$/.test(code))
      typingTimer=setTimeout(()=>search(code,true),650);
    else{clearResults();status.textContent='Aramak için Enter veya Ara düğmesine basın.';}
  });
  $('priceLabelMissingNo').addEventListener('click',()=>{missing.close();clear();});
  $('priceLabelMissingYes').addEventListener('click',()=>{
    const code=pending;missing.close();pending='';
    if(dialog.open)dialog.close();
    onCreateProduct(code);
  });
  missing.addEventListener('cancel',event=>{event.preventDefault();missing.close();clear();});
  $('priceLabelEdit').addEventListener('click',()=>{if(selected)onEditProduct?.(selected);});
  $('priceLabelAddQueue').addEventListener('click',async()=>{
    if(!selected)return;
    const button=$('priceLabelAddQueue'),product=selected;
    button.disabled=true;
    const feedback=$('priceLabelQueueFeedback');feedback.hidden=false;feedback.textContent='Merkeze kaydediliyor…';feedback.classList.remove('lq-error');
    try{const count=Number($('priceLabelCopies').value);await addQueuedLabel(product.id,count);feedback.textContent='✓ Listeye eklendi: '+product.baslik+' · '+count+' adet.';status.textContent=feedback.textContent;input.focus({preventScroll:true});input.select();}
    catch(e){feedback.textContent=e.message;feedback.classList.add('lq-error');status.textContent=e.message;notify(e.message,'error');}finally{button.disabled=false;}
  });
  $('priceLabelPrint').addEventListener('click',async()=>{
    if(!selected)return;
    try{
      const count=Number($('priceLabelCopies').value);if(!Number.isInteger(count)||count<1||count>20)throw Error('Bir baskıda en fazla 20 etiket.');
      // The native PDF page is one 38×100 mm die-cut label.
      // Chrome HTML headers (date, about:blank) are not part of a PDF page.
      const pdf=labelPdfBlob(selected,count);if(autoPrint()){printButton.disabled=true;try{await sendPrint('label',readPrinterProfiles().label,pdf);status.textContent='Etiket yazıcı kuyruğuna gönderildi.';}finally{printButton.disabled=false;}return;}const url=URL.createObjectURL(pdf);
      const tab=window.open(url,'_blank');
      if(!tab){
        URL.revokeObjectURL(url);
        status.textContent='PDF penceresi engellendi. Açılır pencerelere izin verin.';
        return;
      }
      status.textContent='Etiket PDF açıldı. Hedef: '+readPrinterProfiles().label+' · Kağıt: 2×4. Yazdırma ekranında kontrol edin.';
    }catch(error){notify(error.message,'error');status.textContent=error.message;}
  });
  return {open,acceptScan,clear};
}

export {barcodeSvg,code128Codes,eanCheckDigit,makeEan13Bars,makeEan8Bars,labelMarkup,renderLabelImage,printableHtml,labelPdfBlob,createPriceLabelFeature};
