import {MAIN_CATEGORY_ORDER,categoryArtwork} from './category-art.js';
import {SUBCATEGORY_PATHS,subcategoryPhoto} from './subcategory-photos.js';
import {
  refreshCategoryOverrides,categoryOverrideUrl,hasCategoryOverride,
  saveCategoryOverride,restoreCategoryOriginal
} from './category-image-overrides.js';

const $=id=>document.getElementById(id);
const originalFor=path=>path.includes(' > ')?subcategoryPhoto(path)||categoryArtwork(path):categoryArtwork(path);

export async function prepareCategoryImage(file,kind) {
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))
    throw Error('JPG, PNG veya WebP fotoğrafı seçiniz.');
  if(file.size>12*1024*1024)throw Error('Fotoğraf en fazla 12 MB olabilir.');
  const width=kind==='sub'?720:640,height=kind==='sub'?640:640;
  const objectUrl=URL.createObjectURL(file);
  let photo;
  try {
    photo=await new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(Error('Görsel açılamadı.'));
      image.src=objectUrl;
    });
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('Fotoğraf işlenemiyor.');
    ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,width,height);
    // Crop centered (object-fit: cover) so screenshots and stretched pictures
    // do not distort existing main and child category card proportions.
    const w=photo.naturalWidth,h=photo.naturalHeight;
    if(!w||!h)throw Error('Fotoğraf ölçüsü okunamadı.');
    const scale=Math.max(width/w,height/h);
    const scaledW=w*scale,scaledH=h*scale;
    ctx.drawImage(photo,(width-scaledW)/2,(height-scaledH)/2,scaledW,scaledH);
    for(const quality of [0.82,0.69,0.55,0.40]){
      const data=canvas.toDataURL('image/webp',quality);
      if(!data.startsWith('data:image/webp;base64,'))
        throw Error('Tarayıcı WebP görseli hazırlayamıyor.');
      const base64=data.slice('data:image/webp;base64,'.length);
      if(base64.length<=360000)return {base64,data,width,height};
    }
    throw Error('Görsel çok büyük. Daha basit bir fotoğraf seçiniz.');
  }finally{URL.revokeObjectURL(objectUrl);}
}

export function createCategoryImageManager({onImagesChanged=()=>{}}={}) {
  const sheet=$('categoryImageDialog');
  const mainSelect=$('imageEditMain'),subSelect=$('imageEditSub');
  const fileInput=$('imageEditFile');
  const save=$('imageEditSave'),reset=$('imageEditReset');
  const status=$('imageEditStatus');
  const mainPaths=[...MAIN_CATEGORY_ORDER];
  const subPaths=[...SUBCATEGORY_PATHS];
  let kind='main',prepared=null,busy=false,revision=0;
  const path=()=>kind==='main'?mainSelect.value:subSelect.value;
  const message=(text,tone='')=>{
    status.textContent=text;status.className='category-image-status'+(tone?' '+tone:'');
  };
  function options(select,items){
    const last=select.value;select.replaceChildren();
    for(const item of items){
      const el=document.createElement('option');el.value=item.path;el.textContent=item.name;
      select.append(el);
    }
    if(items.some(item=>item.path===last))select.value=last;
  }
  function listSubs(){
    const main=mainSelect.value;
    options(subSelect,subPaths.filter(p=>p.startsWith(main+' > ')).map(p=>({path:p,name:p.slice(main.length+3)})));
  }
  function display(){
    const p=path();
    const original=originalFor(p);
    const custom=categoryOverrideUrl(p);
    const active=Boolean(custom);
    $('imageEditOriginal').src=original||'/icons/placeholder.svg';
    $('imageEditCurrent').src=prepared?.data||custom||original||'/icons/placeholder.svg';
    $('imageEditCurrent').onerror=()=>{
      // A deleted or unreachable override must never erase the saved default.
      $('imageEditCurrent').onerror=null;
      $('imageEditCurrent').src=original||'/icons/placeholder.svg';
    };
    $('imageEditCurrentLabel').textContent=prepared?'Yeni fotoğraf (henüz kaydedilmedi)':
      active?'Değiştirilmiş görsel':'Şu an: ilk kurulum görseli';
    $('imageEditDimensions').textContent=kind==='main'
      ?'Mevcut ana görsel: 320 × 320 px · Önerilen yükleme: 640 × 640 px.'
      :'Mevcut alt görsel: 360 × 320 px · Önerilen yükleme: 720 × 640 px.';
    save.disabled=busy||!prepared;
    reset.disabled=busy||!active;
  }
  function clearSelection(){
    revision++;
    prepared=null;fileInput.value='';
    display();
    message('Kategori seçildi. Görsel yükleyebilir veya ilk görsele dönebilirsiniz.');
  }
  function setKind(value){
    kind=value;
    $('imageEditMainTab').setAttribute('aria-pressed',String(kind==='main'));
    $('imageEditSubTab').setAttribute('aria-pressed',String(kind==='sub'));
    $('imageEditSubWrap').hidden=kind==='main';
    mainSelect.value=mainPaths[0];
    listSubs();
    clearSelection();
  }
  function busyMode(value){
    busy=value;
    fileInput.disabled=value;mainSelect.disabled=value;subSelect.disabled=value;
    $('imageEditMainTab').disabled=value;$('imageEditSubTab').disabled=value;
    display();
  }
  async function reload(silent=false){
    try {
      const count=await refreshCategoryOverrides();
      onImagesChanged();
      display();
      if(!silent)message(count+' özel kategori görseli merkezi veritabanından yüklendi.','success');
      return true;
    }catch(error){
      if(!silent)message('Merkezi görsel kayıtları alınamadı: '+error.message,'error');
      return false;
    }
  }
  async function open(){
    if(!sheet.open)sheet.showModal();
    setKind('main');
    message('Merkezi kategori görselleri okunuyor…');
    await reload();
  }
  $('settingsCategoryImages').addEventListener('click',open);
  $('imageEditMainTab').addEventListener('click',()=>setKind('main'));
  $('imageEditSubTab').addEventListener('click',()=>setKind('sub'));
  mainSelect.addEventListener('change',()=>{listSubs();clearSelection();});
  subSelect.addEventListener('change',clearSelection);
  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files?.[0],version=++revision;
    if(!file){prepared=null;display();return;}
    message('Fotoğraf uygun ölçüye hazırlanıyor…');
    save.disabled=true;
    try{
      const result=await prepareCategoryImage(file,kind);
      if(version!==revision)return;
      prepared=result;
      display();
      message(result.width+' × '+result.height+' px hazır. Kalıcı olması için Görseli Kaydet düğmesine basın.');
    }catch(error){
      if(version!==revision)return;
      prepared=null;fileInput.value='';
      display();message(error.message,'error');
    }
  });
  save.addEventListener('click',async()=>{
    if(!prepared||busy)return;
    const selected=path(),data=prepared.base64;
    busyMode(true);message('Görsel merkezi veritabanına kaydediliyor…');
    try{
      await saveCategoryOverride(selected,data);
      prepared=null;fileInput.value='';
      onImagesChanged();
      display();
      message('✓ Görsel kaydedildi. Sayfa yenilense veya başka cihazdan açılsa da korunacak.','success');
    }catch(error){message('Kaydedilemedi: '+error.message,'error');}
    finally{busyMode(false);}
  });
  reset.addEventListener('click',async()=>{
    if(busy||!hasCategoryOverride(path()))return;
    const selected=path();
    if(!confirm('Bu kategoride yüklediğiniz görsel silinecek. İlk kurulum görseli geri gelsin mi?'))return;
    busyMode(true);message('İlk kurulum görseli geri yükleniyor…');
    try {
      await restoreCategoryOriginal(selected);
      prepared=null;fileInput.value='';
      onImagesChanged();display();
      message('✓ İlk kurulum görseli geri yüklendi ve merkezi veritabanında kaydedildi.','success');
    }catch(error){message('İlk görsele dönülemedi: '+error.message,'error');}
    finally{busyMode(false);}
  });
  options(mainSelect,mainPaths.map(p=>({path:p,name:p})));
  listSubs();
  setKind('main');
  return {reload,open};
}
