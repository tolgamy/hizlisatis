/** Optional Cloudflare Images transformations: only trusted supplier image hosts.
 * ENABLE_IMAGE_RESIZE=true must be explicitly configured on Pages. Never fetch
 * arbitrary user-provided URLs, private hosts, or non-HTTPS resources.
 * Does not use the removed XML feed.
 */
const ALLOWED_HOSTS = new Set([
  'cdn.tgoapps.com', 'locals-media-cdn.getirapi.com', 'cdn.getircarsi.com',
  'cdn.artisandev.getirapi.com', 'static-cdn.labsoffice.com'
]);
const WIDTHS = new Set([192,256,320,640,800]);
export async function onRequestGet({request,env}) {
  const params=new URL(request.url).searchParams;
  const enabled=String(env?.ENABLE_IMAGE_RESIZE||'').toLowerCase()==='true';
  if(params.has('status')) return Response.json({enabled},{headers:{'Cache-Control':'no-store'}});
  if(!enabled) return new Response('Görsel küçültme etkin değil.',{status:503});
  let source;
  try { source = new URL(params.get('url')||''); }
  catch { return new Response('Geçersiz adres',{status:400}); }
  if(source.protocol!=='https:' || !ALLOWED_HOSTS.has(source.hostname.toLowerCase()) ||
      source.port || source.username || source.password || source.pathname.length>2048)
    return new Response('İzin verilmeyen görsel adresi',{status:403});
  const width=Number(params.get('w'));
  if(!WIDTHS.has(width)) return new Response('Geçersiz görsel boyutu',{status:400});
  try {
    // Cloudflare transforms image bytes before returning them, so the mobile
    // browser downloads a real thumbnail rather than CSS-scaled original.
    const upstream=await fetch(source.href,{
      redirect:'error',
      cf:{image:{width,fit:'scale-down',quality:66,format:'webp',metadata:'none'}}
    });
    if(!upstream.ok) return new Response('Görsel erişilemiyor',{status:502});
    const type=(upstream.headers.get('content-type')||'').toLowerCase();
    if(!type.startsWith('image/')) return new Response('Görsel içerik tipi geçersiz',{status:502});
    const headers=new Headers({
      'Content-Type':type,
      'Cache-Control':'public, max-age=86400, s-maxage=604800, immutable',
      'X-Content-Type-Options':'nosniff'
    });
    return new Response(upstream.body,{status:200,headers});
  } catch {
    return new Response('Görsel dönüştürülemedi',{status:502});
  }
}
