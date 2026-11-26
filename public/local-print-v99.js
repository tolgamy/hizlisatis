import {accountStorage130} from './account-storage-v130.js';
const key='hizlisatis-local-print-v98';
export function config(){try{return JSON.parse(accountStorage130().getItem(key)||'{}')}catch{return {}}}
export function autoPrint(){return config().enabled===true}
export function saveConfig(enabled,token){if(enabled&&!/^[a-f0-9]{64}$/.test(token))throw Error('64 karakterli bağlantı kodu gerekli.');accountStorage130().setItem(key,JSON.stringify({enabled,token:enabled?token:''}));}
let busy=false;
export async function sendPrint(kind,name,pdf){
 if(busy)throw Error('Baskı devam ediyor.');if(!autoPrint())throw Error('Otomatik baskı kapalı.');
 busy=true;try{const r=await fetch('http://127.0.0.1:17698/print',{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/pdf','X-Print-Token':config().token,'X-Print-Kind':kind,'X-Printer-Name':encodeURIComponent(name)},body:pdf,signal:AbortSignal.timeout(60000)});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Baskı hatası');return d;}
 catch(e){throw Error('Otomatik baskı: '+e.message+'. Yanlış yazıcıya geçilmedi. Tekrar basmadan kuyruğu kontrol edin.');}finally{busy=false;}
}
export function receiptRollPdf(root,layout){
 const scale=8,w=Math.round(layout.paperMm*scale),pad=Math.round((layout.leftInsetMm+layout.innerPaddingMm)*scale),max=Math.round(layout.contentMm*scale)-2*layout.innerPaddingMm*scale;
 const c=document.createElement('canvas');c.width=w;c.height=1;let ctx=c.getContext('2d');let y=10;const lines=[];
 function line(t,size=23,bold=false,center=false){ctx.font=(bold?'bold ':'')+size+'px Arial';let part='';for(const ch of String(t).trim()){if(part&&ctx.measureText(part+ch).width>max){lines.push({t:part,y:y+size,size,bold,center});y+=size+6;part='';}part+=ch;}if(part){lines.push({t:part,y:y+size,size,bold,center});y+=size+6;}}
 function walk(el){if(el.nodeType===3){if(el.textContent.trim())line(el.textContent);return;}if(el.nodeType!==1)return;
 if(el.classList.contains('receipt-rule')){lines.push({rule:true,y:y+4});y+=10;return;}
 if(el.classList.contains('receipt-row')){const a=el.children[0]?.textContent||'',b=el.children[1]?.textContent||'';ctx.font='bold 23px Arial';if(ctx.measureText(a).width+ctx.measureText(b).width+10<max){lines.push({t:a,right:b,y:y+23,size:23,bold:true});y+=29;}else{line(a);line(b,23,true);}return;}
 if(el.classList.contains('receipt-center')||el.classList.contains('receipt-title')){line(el.innerText||el.textContent,el.classList.contains('receipt-title')?30:20,true,true);return;}
 for(const child of el.childNodes)walk(child);}
 for(const child of root.childNodes)walk(child);c.height=Math.max(320,y+20);if(c.height>16000)throw Error('Fiş çok uzun.');
 ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,w,c.height);ctx.fillStyle='black';
 for(const l of lines){if(l.rule){ctx.fillRect(pad,l.y,max,2);continue;}ctx.font=(l.bold?'bold ':'')+l.size+'px Arial';ctx.textAlign=l.center?'center':'left';ctx.fillText(l.t,l.center?pad+max/2:pad,l.y);if(l.right){ctx.textAlign='right';ctx.fillText(l.right,pad+max,l.y);}}
 const image=Uint8Array.from(atob(c.toDataURL('image/jpeg',.95).split(',')[1]),x=>x.charCodeAt(0));const pw=(w/scale*72/25.4).toFixed(4),ph=(c.height/scale*72/25.4).toFixed(4),enc=new TextEncoder(),chunks=[],offset=[];let n=0;
 const add=x=>{const b=typeof x==='string'?enc.encode(x):x;chunks.push(b);n+=b.length};const obj=(i,h,b)=>{offset[i]=n;add(i+' 0 obj\n'+h);if(b){add(b);add('\nendstream')}add('\nendobj\n')};
 add('%PDF-1.4\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,'<< /Type /Pages /Kids [4 0 R] /Count 1 >>');obj(3,'<< /Type /XObject /Subtype /Image /Width '+w+' /Height '+c.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+image.length+' >>\nstream\n',image);obj(4,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pw+' '+ph+'] /Resources << /XObject << /Im0 3 0 R >> >> /Contents 5 0 R >>');const cmd='q\n'+pw+' 0 0 '+ph+' 0 0 cm\n/Im0 Do\nQ\n';obj(5,'<< /Length '+enc.encode(cmd).length+' >>\nstream\n'+cmd+'endstream');const x=n;add('xref\n0 6\n0000000000 65535 f \n');for(let i=1;i<=5;i++)add(String(offset[i]).padStart(10,'0')+' 00000 n \n');add('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+x+'\n%%EOF');return new Blob(chunks,{type:'application/pdf'});
}
