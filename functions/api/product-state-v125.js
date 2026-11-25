import {onRequestGet as originalGet,onRequestPost} from './product-state.js';
import {currentAccessUser} from '../../lib/user-access.js';
import {fine125} from '../../lib/rights-v125.js';
export {onRequestPost};
const SAFE=new Set(['id','barkod','urunKodu','baslik','marka','kategori','kategoriYolu','kategoriAna','kategoriAlt','kaynakKategori','aciklama','aciklamaMetin','gorsel','source','stok','stokBelirsiz','satisFiyati','fiyatBelirsiz','piyasaFiyati','kdv','kdvBelirsiz','kdvExcluded','paraBirimi','birim','variantKey','mensei','menşei','beden','renk','deletedFrom','lifecycleStatus','everActivated','statusChangedAt','importFormat']);
export const safeProduct125=p=>Object.fromEntries(Object.entries(p).filter(([key])=>SAFE.has(key)));
export async function onRequestGet(ctx){
 const user=await currentAccessUser(ctx.request,ctx.env);
 if(!user)return Response.json({error:'Ürün sorgulamak için oturum gerekli.'},{status:403,headers:{'Cache-Control':'no-store'}});
 const res=await originalGet(ctx);
 if(!res.ok||fine125(user,'product.cost','products'))return res;
 const data=await res.json();
 if(Array.isArray(data.products))data.products=data.products.map(safeProduct125);
 return Response.json(data,{status:res.status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
