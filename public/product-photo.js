/** Product-photo preparation for Cloudflare D1 managed records.
 * Keep product images within the product-state JSON limit (350 kB as text).
 * The result is a data URI stored centrally, not a device-only object URL.
 */
const MAX_FILE_BYTES=12*1024*1024;
const MAX_DATA_LENGTH=300000;
const DATA_URI=/^data:image\/(?:webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

export function validProductPhoto(data){
  return typeof data==='string'&&data.length<=MAX_DATA_LENGTH&&DATA_URI.test(data);
}

export async function prepareProductPhoto(file){
  if(!file||typeof file.type!=='string'||!file.type.startsWith('image/'))
    throw Error('JPG, PNG, WebP veya desteklenen bir fotoğraf seçiniz.');
  if(!Number.isFinite(file.size)||file.size<1||file.size>MAX_FILE_BYTES)
    throw Error('Ürün fotoğrafı en fazla 12 MB olabilir.');

  const objectUrl=URL.createObjectURL(file);
  try{
    const photo=await new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(Error('Fotoğraf açılamadı. JPG veya PNG olarak yeniden deneyin.'));
      image.src=objectUrl;
    });
    const width=photo.naturalWidth,height=photo.naturalHeight;
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)
      throw Error('Fotoğrafın boyutu okunamadı.');

    // Retry smaller dimensions and lower qualities rather than silently
    // dropping a large or detailed image on Save.
    const canvas=document.createElement('canvas');
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('Tarayıcı fotoğraf işleme özelliğini desteklemiyor.');

    for(const maxSide of [640,512,400,320,256]){
      const scale=Math.min(1,maxSide/Math.max(width,height));
      canvas.width=Math.max(1,Math.round(width*scale));
      canvas.height=Math.max(1,Math.round(height*scale));
      // JPEG fallback requires an opaque background for transparent PNGs.
      ctx.fillStyle='#ffffff';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(photo,0,0,canvas.width,canvas.height);
      for(const type of ['image/webp','image/jpeg']){
        for(const quality of [0.78,0.62,0.46]){
          let data='';
          try{data=canvas.toDataURL(type,quality);}catch{/* Try another encoder. */}
          if(validProductPhoto(data))return data;
        }
      }
    }
    throw Error('Fotoğraf yeterince küçültülemedi. Daha küçük bir JPG veya PNG seçiniz.');
  }finally{
    URL.revokeObjectURL(objectUrl);
  }
}
