/** Shared number and URL validation for Excel-first catalogue. */
export function asText(value) { return value == null ? '' : String(value).trim(); }
export function parseLocaleNumber(value, fallback=0) {
  if(typeof value==='number')return Number.isFinite(value)?value:fallback;
  let raw=asText(value).replace(/\u00a0/g,' ').replace(/[^0-9.,+\-]/g,'');
  if(!raw||!/[0-9]/.test(raw))return fallback;
  const negative=raw[0]==='-';raw=raw.replace(/[+\-]/g,'');
  const comma=raw.lastIndexOf(','),dot=raw.lastIndexOf('.'),pos=Math.max(comma,dot);
  if(pos>=0){
    const sep=raw[pos],before=raw.slice(0,pos),after=raw.slice(pos+1);
    const decimal=before.includes(sep===','?'.':',')||(after.length>0&&after.length!==3)||(before==='0'&&after.length===3);
    raw=decimal?before.replace(/[.,]/g,'')+'.'+after:raw.replace(/[.,]/g,'');
  }
  const n=Number(raw);return Number.isFinite(n)?(negative?-n:n):fallback;
}
export function safeImageUrl(value) {
  const raw=asText(value).replace(/&amp;/gi,'&');
  if(!raw)return '';
  try {
    const url=new URL(raw.startsWith('//')?'https:'+raw:raw);
    return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';
  }catch{return '';}
}
