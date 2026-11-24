// v89: Read-only price lookup and 38 × 100 mm shelf label printing. No sale or inventory mutations.

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
function labelMarkup(product){
  const price=labelPrice(product);
  if(price===null)throw Error('Bu ürünün satış fiyatı tanımlı değil.');
  const barcode=String(product.barkod||product.urunKodu||'').trim();
  const svg=barcodeSvg(barcode);
  const title=escapeLabelHtml(product.baslik||'Ürün');
  const unit=escapeLabelHtml(product.birim||'adet');
  const kdv=Number(product.kdv);
  const kdvText=Number.isFinite(kdv)&&kdv>=0?'Fiyatlarımıza %'+kdv+' KDV dahildir.':'KDV dahil satış fiyatı';
  return '<article class="pl-ticket">'+
    '<div class="pl-ticket-market">USMAR MARKET</div>'+
    '<div class="pl-ticket-origin">MENŞEİ: '+escapeLabelHtml(product.mensei||product.menşei||'Belirtilmedi')+'</div>'+
    '<div class="pl-ticket-name">'+title+'</div>'+
    '<div class="pl-ticket-price">'+priceText(price)+'<small> ₺</small></div>'+
    '<div class="pl-ticket-unit">Birim fiyat: '+priceText(price)+' ₺ / '+unit+'</div>'+
    '<div class="pl-ticket-barcode">'+svg+'</div>'+
    '<div class="pl-ticket-footer">'+escapeLabelHtml(kdvText)+'</div>'+
  '</article>';
}
function printableHtml(product,count){
  const safeCount=Math.max(1,Math.min(50,Math.trunc(Number(count)||1)));
  const label=labelMarkup(product);
  const tickets=Array.from({length:safeCount},()=>label).join('');
  return '<!doctype html><html lang="tr"><head><meta charset="UTF-8"><title>USMAR MARKET — Raf Etiketi</title>'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<style>@page{size:38mm 100mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;width:38mm;background:white;color:black;font-family:Arial,Helvetica,sans-serif}'+
  '.pl-ticket{position:relative;display:flex;flex-direction:column;align-items:stretch;overflow:hidden;width:38mm;height:100mm;margin:0;padding:2mm 2mm 1.5mm;page-break-after:always;break-after:page}'+
  '.pl-ticket-market{background:#000!important;color:#fff!important;font-weight:900;font-size:11pt;text-align:center;padding:1.8mm .5mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
  '.pl-ticket-origin{text-align:right;font-size:5.5pt;margin-top:1.5mm;min-height:4mm}'+
  '.pl-ticket-name{font-size:13pt;font-weight:900;line-height:1.1;overflow-wrap:anywhere;min-height:21mm;max-height:33mm;overflow:hidden;margin:2mm 0 1mm}'+
  '.pl-ticket-price{font-size:28pt;line-height:1.05;font-weight:900;text-align:center;white-space:nowrap;margin:2mm 0}'+
  '.pl-ticket-price small{font-size:15pt}.pl-ticket-unit{font-size:6pt;text-align:center;margin-bottom:3mm}'+
  '.pl-ticket-barcode{height:24mm;max-height:24mm;display:flex;align-items:center}.pl-barcode{width:100%;height:22mm}'+
  '.pl-ticket-footer{text-align:center;font-size:5.7pt;margin-top:auto}'+
  '@media screen{body{background:#e9edf3;padding:12px;width:auto}.pl-ticket{background:#fff;border:1px solid #000;margin:0 auto 12px}}'+
  '</style></head><body>'+tickets+'</body></html>';
}
function createPriceLabelFeature({getProducts,findBarcode,openCamera,onCreateProduct,notify}){
  const $=id=>document.getElementById(id);
  const dialog=$('priceLabelDialog'),missing=$('priceLabelMissingDialog');
  const input=$('priceLabelInput'),list=$('priceLabelMatches');
  const result=$('priceLabelResult'),paper=$('priceLabelTicketPreview');
  const status=$('priceLabelStatus'),printButton=$('priceLabelPrint');
  let selected=null,pending='',typingTimer=null;
  const clearResults=()=>{
    selected=null;list.replaceChildren();result.hidden=true;paper.replaceChildren();printButton.disabled=true;
  };
  const showResult=product=>{
    selected=product;list.replaceChildren();
    $('priceLabelName').textContent=product.baslik||'Ürün';
    $('priceLabelCode').textContent='Barkod: '+(product.barkod||product.urunKodu||'Yok');
    const price=labelPrice(product);
    $('priceLabelPrice').textContent=price===null?'Fiyat belirtilmemiş':priceText(price)+' ₺';
    result.hidden=false;
    try{
      paper.innerHTML=labelMarkup(product);
      printButton.disabled=false;
      status.textContent='Ürün bulundu. Argox etiket önizlemesi hazır.';
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
    if(window.matchMedia('(max-width:767px) and (pointer:coarse)').matches){
      dialog.close();openCamera();
    }else input.focus({preventScroll:true});
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
  $('priceLabelPrint').addEventListener('click',()=>{
    if(!selected)return;
    try{
      const count=Math.max(1,Math.min(50,Number($('priceLabelCopies').value)||1));
      const html=printableHtml(selected,count);
      const win=window.open('','_blank','width=440,height=740');
      if(!win){status.textContent='Yazdırma penceresi engellendi. Bu siteye açılır pencere izni verin.';return;}
      win.document.open();win.document.write(html);win.document.close();
      win.focus();
      // The system print dialog lets the operator select the installed Argox OS-214 Plus.
      win.addEventListener('load',()=>setTimeout(()=>win.print(),400),{once:true});
      status.textContent='Yazıcı listesinden Argox OS-214 Plus ve 38 × 100 mm kâğıdı seçin; ölçek %100 olsun.';
    }catch(error){notify(error.message,'error');status.textContent=error.message;}
  });
  return {open,acceptScan,clear};
}

export {barcodeSvg,code128Codes,eanCheckDigit,makeEan13Bars,makeEan8Bars,labelMarkup,printableHtml,createPriceLabelFeature};
