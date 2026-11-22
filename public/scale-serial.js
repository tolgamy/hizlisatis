/** HızlıSatış weight and PC serial scale adapter.
 *
 * CAS ER PLUS-2 was shown attached to COM5 in the user's existing POS.
 * Its physical RS-232 framing / ASCII command set has NOT been established.
 * Decode only unambiguous weight frames. Never issue calibration, tare or
 * other serial write commands without an identified protocol.
 *
 * Web Serial requires a secure Chrome/Edge Windows user gesture, and the user
 * must select the correct COM port. A port already in use cannot be shared.
 */
export const isWeightProduct = p => p?.birim==='kg'||p?.birim==='g';
export const scaleSupported = (nav=globalThis.navigator) =>
  Boolean(nav?.serial?.requestPort) && /win/i.test(
    String(nav?.userAgentData?.platform||nav?.platform||nav?.userAgent||''));
export const scaleGramsToQuantity=(grams,unit='kg')=>{
  const n=Number(grams);
  if(!Number.isInteger(n)||n<1||n>100000)throw RangeError('Gramaj 1–100.000 g arasında olmalı.');
  return unit==='g'?n:Math.round(n/1000*1000)/1000;
};
export function parseManualGrams(input){
  const str=String(input??'').trim();
  if(!/^\d{1,6}$/.test(str))throw Error('Gramajı tam sayı olarak girin (ör. 564).');
  const value=Number(str);
  if(!Number.isInteger(value)||value<1||value>100000)throw Error('Gramaj 1–100.000 g arasında olmalı.');
  return value;
}
export const calculateWeightTotal=(grams,unitPrice,unit='kg')=>{
  const qty=scaleGramsToQuantity(grams,unit);
  const price=Number(unitPrice);
  if(!Number.isFinite(price)||price<0)throw RangeError('Ürün fiyatı geçersiz.');
  return Math.round((qty*price+Number.EPSILON)*100)/100;
};

/** Return kg (weight), or null (unknown/incomplete or non-stable).
 * The scale may output several numeric columns (price, subtotal). Reject
 * ambiguous frames rather than mistaking ₺ prices for kilograms.
 */
export function parseScaleReading(frame){
  let text=String(frame??'').replace(/[\x02\x03\x00]/g,'').trim();
  if(!text||text.length>120)return null;
  if(/\b(?:US|UNSTABLE|MOTION|OL|OVER|ERROR|ERR)\b/i.test(text))return null;
  // Stable-tagged CAS-like: "ST,GS,+000.564kg" or "ST,NT,0.564"
  const stable=/\bST\b/i.test(text);
  let match=text.match(/\b(?:WEIGHT|NET|GROSS|AGIRLIK|AĞIRLIK|KG)\s*[:=]\s*([+-]?\d{1,5}(?:[.,]\d{1,3})?)\s*(kg|g)?\b/i);
  if(!match)match=text.match(/^ST[\s,;]+(?:GS|NT|NET|GROSS)?[\s,;]*([+-]?\d{1,5}(?:[.,]\d{1,3})?)\s*(kg|g)?\s*$/i);
  if(!match)match=text.match(/^\s*([+]?\d{1,5}(?:[.,]\d{1,3})?)\s*(kg|g)\s*$/i);
  if(!match)match=text.match(/^\s*([+]?\d{1,5}[.,]\d{1,3})\s*$/);
  if(!match)return null;
  const value=Number(match[1].replace(',','.'));
  if(!Number.isFinite(value)||value<=0)return null;
  const grams=(match[2]||'kg').toLowerCase()==='g'?Math.round(value):Math.round(value*1000);
  if(grams<1||grams>100000)return null;
  // The frame was unambiguous but untagged; require multiple identical frames
  // before the app enables "Teraziden Al".
  return {grams,stable};
}

export class ScaleSerialConnection {
  constructor({onReading=()=>{},onStatus=()=>{},onRaw=()=>{},nav=globalThis.navigator}={}){
    this.nav=nav;this.onReading=onReading;this.onStatus=onStatus;this.onRaw=onRaw;
    this.port=null;this.reader=null;this.readTask=null;this.connected=false;
    this.active=false;this.lastGrams=null;this.matches=0;this.lastAt=0;
    this.buffer='';
  }
  async connect({baudRate=9600,dataBits=8,parity='none',stopBits=1}={}){
    if(!scaleSupported(this.nav))throw Error('Seri terazi yalnız Windows Chrome/Edge üzerinden bağlanabilir.');
    if(this.port)await this.disconnect();
    const port=await this.nav.serial.requestPort(); // Direct user click only.
    try{
      await port.open({baudRate:Number(baudRate),dataBits:Number(dataBits),stopBits:Number(stopBits),parity});
    }catch(e){
      throw Error('Terazi portu açılamadı. COM5 eski kasa programı tarafından kullanılıyor olabilir. '+(e?.message||''));
    }
    this.port=port;this.active=true;this.connected=true;
    this.lastGrams=null;this.matches=0;this.lastAt=0;this.buffer='';
    this.onStatus('Bağlandı. Teraziden sabit ağırlık bekleniyor…');
    // Loop runs while this modal is open; connection remains available for
    // future weighings until the operator explicitly disconnects.
    this.readTask=this.readLoop(port);
  }
  consume(input){
    this.buffer+=String(input||'');
    if(this.buffer.length>2048)this.buffer=this.buffer.slice(-512);
    // Never guess from incomplete serial packets.
    const frames=this.buffer.split(/[\r\n\x03]+/);
    this.buffer=frames.pop()||'';
    for(const frame of frames){
      const text=frame.replace(/[\x00-\x1f]/g,'').trim();
      if(!text)continue;
      this.onRaw(text.slice(0,140));
      const parsed=parseScaleReading(text);
      if(!parsed)continue;
      const now=Date.now();
      if(this.lastGrams===parsed.grams && now-this.lastAt<3500)this.matches++;
      else this.matches=1;
      this.lastGrams=parsed.grams;this.lastAt=now;
      if(this.matches>=2)this.onReading({...parsed,at:now});
    }
  }
  async readLoop(port){
    const decoder=new TextDecoder();
    try{
      while(this.active&&this.port===port&&port.readable){
        const reader=port.readable.getReader();
        this.reader=reader;
        try{
          while(this.active){
            const {value,done}=await reader.read();
            if(done)break;
            if(value?.length)this.consume(decoder.decode(value,{stream:true}));
          }
        }finally{
          reader.releaseLock();
          if(this.reader===reader)this.reader=null;
        }
        if(this.active)break;
      }
      if(this.active)this.onStatus('Teraziden veri akışı durdu. Bağlantıyı kontrol edin.');
    }catch(e){
      if(this.active)this.onStatus('Seri veri okunamadı: '+(e?.message||'Bağlantı kesildi.'));
    }finally{
      if(this.port===port){this.connected=false;this.active=false;}
    }
  }
  async disconnect(){
    this.active=false;
    const reader=this.reader,port=this.port;
    this.port=null;this.connected=false;this.lastGrams=null;this.matches=0;
    try{await reader?.cancel();}catch{}
    try{await this.readTask;}catch{}
    try{await port?.close();}catch{}
    this.readTask=null;this.reader=null;
    this.onStatus('Terazi bağlantısı kapalı. Gramajı elle girebilirsiniz.');
  }
}
