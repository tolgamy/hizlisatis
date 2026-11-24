// v92: Single PNG per printed Argox 38x100mm page; avoid rotated HTML and extra pages.

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
  return '<div class="pl-paper"><article class="pl-ticket">'+
    '<div class="pl-ticket-market">USMAR MARKET</div>'+
    '<div class="pl-ticket-origin">MENŞEİ: '+escapeLabelHtml(product.mensei||product.menşei||'Belirtilmedi')+'</div>'+
    '<div class="pl-ticket-name">'+title+'</div>'+
    '<div class="pl-ticket-price">'+priceText(price)+'<small> ₺</small></div>'+
    '<div class="pl-ticket-unit">Birim fiyat: '+priceText(price)+' ₺ / '+unit+'</div>'+
    '<div class="pl-ticket-barcode">'+svg+'</div>'+
    '<div class="pl-ticket-footer">'+escapeLabelHtml(kdvText)+'</div>'+
  '</article></div>';
}

// Argox prints each 38x100mm yellow die-cut label as a separate portrait page.
// Rasterize the sideways artwork before printing to avoid Chromium pagination
// of transformed 100x38mm HTML boxes. Transparent pixels expose yellow paper.
function renderLabelImage(product,canvasFactory){
  const price=labelPrice(product);
  if(price===null)throw Error('Bu ürünün satış fiyatı tanımlı değil.');
  const code=String(product.barkod||product.urunKodu||'').trim();
  if(!code)throw Error('Barkod numarası bulunamadı.');
  const canvas=canvasFactory?canvasFactory():document.createElement('canvas');
  const k=8,W=100*k,H=38*k;
  canvas.width=H;canvas.height=W;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Etiket görseli oluşturulamadı.');
  ctx.save();ctx.translate(0,W);ctx.rotate(-Math.PI/2);
  ctx.fillStyle='#000';ctx.textBaseline='alphabetic';
  ctx.fillRect(20,15,760,51);
  ctx.save();ctx.globalCompositeOperation='destination-out';
  ctx.font='900 36px Arial,sans-serif';ctx.textAlign='center';
  ctx.fillText('USMAR MARKET',400,51);ctx.restore();
  ctx.textAlign='left';ctx.fillStyle='#000';
  const words=String(product.baslik||'Ürün').trim().split(/\s+/);
  ctx.font='900 31px Arial,sans-serif';
  let line='',lines=[];
  for(const word of words){
    const next=line?line+' '+word:word;
    if(ctx.measureText(next).width>545&&line){lines.push(line);line=word;}
    else line=next;
  }
  if(line)lines.push(line);
  if(lines.length>3){
    lines.length=3;let tail=lines[2];
    while(tail&&ctx.measureText(tail+'…').width>545)tail=tail.slice(0,-1);
    lines[2]=tail+'…';
  }
  lines.forEach((value,i)=>ctx.fillText(value,47,110+i*34,545));
  const priceLabel=priceText(price)+' ₺';
  let size=62;ctx.font='900 '+size+'px Arial,sans-serif';
  while(ctx.measureText(priceLabel).width>310&&size>38){size-=2;ctx.font='900 '+size+'px Arial,sans-serif';}
  ctx.textAlign='center';ctx.fillText(priceLabel,595,228,310);
  ctx.font='16px Arial,sans-serif';
  ctx.fillText('Birim fiyat: '+priceText(price)+' ₺ / '+String(product.birim||'adet'),596,257,315);
  ctx.textAlign='right';ctx.font='12px Arial,sans-serif';
  ctx.fillText('MENŞEİ: '+String(product.mensei||product.menşei||'Belirtilmedi'),775,93,160);
  let bits=makeEan13Bars(code)||makeEan8Bars(code);
  if(!bits&&/^\d{12}$/.test(code))bits=makeEan13Bars('0'+code);
  if(!bits){
    bits='';
    for(const n of code128Codes(code)){
      const pat=CODE128_PATTERNS[n];
      for(let i=0;i<pat.length;i++)bits+=(i%2===0?'1':'0').repeat(Number(pat[i]));
    }
  }
  const quiet=11,x=48,y=207,width=340,modules=bits.length+quiet*2,step=width/modules;
  for(let i=0;i<bits.length;i++)if(bits[i]==='1')
    ctx.fillRect(x+(quiet+i)*step,y,step+.05,64);
  ctx.textAlign='center';ctx.font='17px Arial,sans-serif';
  ctx.fillText(code,x+width/2,294,width);
  const vat=Number(product.kdv);
  ctx.font='12px Arial,sans-serif';
  ctx.fillText(Number.isFinite(vat)&&vat>=0?'Fiyatlarımıza %'+vat+' KDV dahildir.':'KDV dahil fiyat',590,291,340);
  ctx.restore();
  return canvas.toDataURL('image/png');
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
      const preview=document.createElement('img');
      preview.className='pl-label-image';
      preview.alt='USMAR MARKET 38 × 100 mm etiket önizlemesi';
      preview.src=renderLabelImage(product);
      paper.replaceChildren(preview);
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
      // The printed document contains exactly one 38x100mm image per page.
      const printReady=()=>{
        Promise.all(Array.from(win.document.images,im=>im.decode
          ? im.decode().catch(()=>{}) : Promise.resolve())).then(()=>{
          win.focus();win.print();
        });
      };
      if(win.document.readyState==='complete')printReady();
      else win.addEventListener('load',printReady,{once:true});
      status.textContent='Argox OS-214 Plus: 38 × 100 mm, ölçek %100, kenar boşluğu yok, Üstbilgiler ve altbilgiler KAPALI.';
    }catch(error){notify(error.message,'error');status.textContent=error.message;}
  });
  return {open,acceptScan,clear};
}

export {barcodeSvg,code128Codes,eanCheckDigit,makeEan13Bars,makeEan8Bars,labelMarkup,renderLabelImage,printableHtml,createPriceLabelFeature};
