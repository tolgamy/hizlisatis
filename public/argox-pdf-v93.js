/** Each PDF page is exactly one 38×100mm Argox die-cut shelf label.
 * Exported PDF pages never include browser print headers or footer URLs.
 * The JPEG comes from a previously rendered, pre-rotated 304×800 canvas.
 */
export function pdfFromLabelJpeg(jpeg,copies=1){
  const start='data:image/jpeg;base64,';
  if(typeof jpeg!=='string'||!jpeg.startsWith(start))throw Error('Etiket için JPEG görseli gerekli.');
  const count=Math.max(1,Math.min(50,Math.trunc(Number(copies)||1)));
  const raw=atob(jpeg.slice(start.length)),image=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)image[i]=raw.charCodeAt(i);
  const width=(38*72/25.4).toFixed(4),height=(100*72/25.4).toFixed(4);
  const enc=new TextEncoder(),chunks=[],offsets=[],total=3+count*2;let length=0;
  const append=value=>{
    const bytes=typeof value==='string'?enc.encode(value):value;
    chunks.push(bytes);length+=bytes.length;
  };
  const object=(id,header,stream)=>{
    offsets[id]=length;
    append(id+' 0 obj\n'+header);
    if(stream){append(stream);append('\nendstream');}
    append('\nendobj\n');
  };
  append('%PDF-1.4\n');append(new Uint8Array([37,226,227,207,211,10]));
  const kids=Array.from({length:count},(_,i)=>(4+2*i)+' 0 R').join(' ');
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,'<< /Type /Pages /Kids ['+kids+'] /Count '+count+' >>');
  object(3,'<< /Type /XObject /Subtype /Image /Width 304 /Height 800 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+image.length+' >>\nstream\n',image);
  for(let i=0;i<count;i++){
    const page=4+i*2,content=page+1;
    object(page,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+width+' '+height+'] /Resources << /XObject << /Im0 3 0 R >> >> /Contents '+content+' 0 R >>');
    const commands='q\n'+width+' 0 0 '+height+' 0 0 cm\n/Im0 Do\nQ\n';
    object(content,'<< /Length '+enc.encode(commands).length+' >>\nstream\n'+commands+'endstream');
  }
  const xref=length;
  append('xref\n0 '+(total+1)+'\n0000000000 65535 f \n');
  for(let i=1;i<=total;i++)append(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
  append('trailer\n<< /Size '+(total+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');
  return new Blob(chunks,{type:'application/pdf'});
}