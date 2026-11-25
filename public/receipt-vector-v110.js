// Vector-only 80 mm thermal PDF. Base-14 Helvetica (Arial-compatible metrics),
// Turkish encoding, and an original vector lira mark. No bitmap, JPEG, font download,
// canvas, external service or printer-specific font dependency.
const MM=72/25.4;
const REG=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const BOLD=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const LATIN_REG=[278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const LATIN_BOLD=[278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];
const extra={'Ğ':128,'ğ':129,'İ':130,'ı':131,'Ş':132,'ş':133,'€':134,'Œ':135,'œ':136,'Ÿ':137,'Ł':138,'ł':139};
const extraBase={'Ğ':'G','ğ':'g','İ':'I','ı':'i','Ş':'S','ş':'s','€':'0','Œ':'W','œ':'w','Ÿ':'Y','Ł':'L','ł':'l'};
const clean=t=>String(t??'').normalize('NFC').replace(/[\r\n\t]+/g,' ').replace(/[–—−]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/…/g,'...').replace(/[❌✕✖]/gu,'×').replace(/[\uFE0E\uFE0F]/g,'').trim();
function supported(ch){const n=ch.codePointAt(0);return (n>=32&&n<=126)||(n>=160&&n<=255)||Object.hasOwn(extra,ch)||ch==='₺';}
function chars(t){return Array.from(clean(t)).flatMap(ch=>supported(ch)?[ch]:Array.from(ch.normalize('NFKD').replace(/\p{M}/gu,'')).map(x=>supported(x)?x:'?'));}
function code(ch){return extra[ch]??ch.charCodeAt(0);}
function width(ch,bold){if(ch==='₺')return 640;if(ch==='ı')return 278;if(Object.hasOwn(extraBase,ch))ch=extraBase[ch];const c=code(ch);return (c>=32&&c<=126?(bold?BOLD:REG)[c-32]:(bold?LATIN_BOLD:LATIN_REG)[c-160])??1000;}
const n=v=>Number(v.toFixed(4)).toString();
const hx=x=>x.toString(16).padStart(2,'0').toUpperCase();
const measured=(cs,size,bold)=>cs.reduce((sum,ch)=>sum+width(ch,bold),0)*size/1000;
export function vectorReceiptLayout110(root,layout){
 const paper=80*MM,left=(Number(layout.leftInsetMm)||1.5)*MM,max=Math.min(Number(layout.contentMm)||56,80-left/MM-2)*MM,right=left+max;
 if(max<40*MM)throw Error('Fiş baskı alanı çok dar.');
 const ops=[];let y=4*MM;
 function fit(text,base,bold,limit){const cs=chars(text),natural=measured(cs,base,bold);const size=Math.max(5,Math.min(base,base*limit/Math.max(natural,.01)));const w=measured(cs,size,bold),scale=Math.min(1,limit/Math.max(w,.01));return {cs,size,bold,w:w*scale,scale};}
 function place(t,x,align){const start=align==='right'?x-t.w:align==='center'?x-t.w/2:x;ops.push({type:'text',...t,x:start,y});}
 function line(text,base=9,bold=true,align='left'){const t=fit(text,base,bold,max-.6);y+=t.size;place(t,align==='center'?(left+right)/2:align==='right'?right-.3:left+.3,align);y+=3;}
 function rule(heavy=false){y+=2;ops.push({type:'rule',x:left,x2:right,y,weight:heavy?.9:.5});y+=2;}
 function columns(values,base,bold=true){const gap=3.4,available=max-2*gap-.6;
  const cs=values.map(chars),natural=cs.map(c=>measured(c,base,bold)),sum=natural.reduce((a,b)=>a+b,0);
  const size=Math.max(5,Math.min(base,base*available/Math.max(sum,.01)));
  const scaled=cs.map(c=>measured(c,size,bold)),factor=Math.min(1,available/Math.max(.01,scaled.reduce((a,b)=>a+b,0)));
  const t=cs.map((c,i)=>({cs:c,size,bold,w:scaled[i]*factor,scale:factor}));
  y+=size;place(t[0],left+.3,'left');place(t.at(-1),right-.3,'right');
  if(t.length===3){const a=left+.3+t[0].w+gap,b=right-.3-t[2].w-gap;place(t[1],(a+b)/2,'center');}
  y+=3;
 }
 function walk(el){
  if(el.nodeType===3){if(el.textContent.trim())line(el.textContent);return;}
  if(el.nodeType!==1)return;const has=c=>el.classList.contains(c);
  if(has('receipt-rule')){rule();return;}
  if(has('receipt-quote-name')){line(el.textContent,9.5,true);return;}
  if(has('receipt-quote-metrics')){columns(Array.from(el.children,x=>x.textContent),8.6);return;}
  if(has('receipt-row')){const a=el.children[0]?.textContent||'',b=el.children[1]?.textContent||'';columns([a,b],has('receipt-grand')?12:9);return;}
  if(has('receipt-title')){line(el.textContent,14,true,'center');return;}
  if(has('receipt-center')){line(el.textContent,has('receipt-quote-warning')?10:8,true,'center');return;}
  for(const child of el.childNodes)walk(child);
 }
 for(const child of root.childNodes)walk(child);
 const height=Math.max(81*MM,y+2*MM);
 if(height>2000*MM)throw Error('Fiş çok uzun.');
 return {paper,height,left,right,ops};
}
function drawLira(x,y,s,scale,bold){
 // Original vector ₺: upright stem, hooked lower stroke and two rising bars.
 // ActualText preserves the currency symbol for text extraction.
 const xx=v=>n(x+v*s*scale),yy=v=>n(y+v*s);
 return '/Span << /ActualText <FEFF20BA> >> BDC\n'+n(s*(bold?.083:.065))+' w 1 J 1 j\n'+
 xx(.25)+' '+yy(.77)+' m '+xx(.25)+' '+yy(.04)+' l '+xx(.55)+' '+yy(.03)+' '+xx(.64)+' '+yy(.22)+' '+xx(.57)+' '+yy(.38)+' c S\n'+
 xx(.08)+' '+yy(.46)+' m '+xx(.51)+' '+yy(.65)+' l S\n'+xx(.08)+' '+yy(.30)+' m '+xx(.51)+' '+yy(.49)+' l S\nEMC\n';
}
function textCmd(op,height){
 const y=height-op.y;let x=op.x,out='',hex='',start=x;
 const flush=()=>{if(!hex)return;out+='BT /'+(op.bold?'FB':'FR')+' '+n(op.size)+' Tf '+n(op.scale*100)+' Tz 1 0 0 1 '+n(start)+' '+n(y)+' Tm <'+hex+'> Tj ET\n';hex='';};
 for(const ch of op.cs){if(ch==='₺'){flush();out+=drawLira(x,y,op.size,op.scale,op.bold);x+=width(ch,op.bold)*op.size*op.scale/1000;start=x;}else{if(!hex)start=x;hex+=hx(code(ch));x+=width(ch,op.bold)*op.size*op.scale/1000;}}
 flush();return out;
}
export function vectorReceiptSource110(root,layout){
 const page=vectorReceiptLayout110(root,layout);
 let commands='0 g 0 G\n';
 for(const op of page.ops){if(op.type==='rule'){const y=n(page.height-op.y);commands+=n(op.weight)+' w '+n(op.x)+' '+y+' m '+n(op.x2)+' '+y+' l S\n';}else commands+=textCmd(op,page.height);}
 const differences='128 /Gbreve /gbreve /Idotaccent /dotlessi /Scedilla /scedilla /Euro /OE /oe /Ydieresis /Lslash /lslash';
 const font=name=>'<< /Type /Font /Subtype /Type1 /BaseFont /'+name+' /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences ['+differences+'] >> >>';
 const objects=[
 '<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None /PrintArea /MediaBox /PrintClip /MediaBox >> >>',
 '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+n(page.paper)+' '+n(page.height)+'] /Rotate 0 /Resources << /Font << /FR 4 0 R /FB 5 0 R >> >> /Contents 6 0 R >>',
 font('Helvetica'),font('Helvetica-Bold'),
 '<< /Length '+commands.length+' >>\nstream\n'+commands+'endstream'
 ];
 let pdf='%PDF-1.4\n',offsets=[];
 for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
 const start=pdf.length;pdf+='xref\n0 7\n0000000000 65535 f \n'+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';
 return pdf;
}
export function vectorReceiptPdf110(root,layout){return new Blob([vectorReceiptSource110(root,layout)],{type:'application/pdf'});}
