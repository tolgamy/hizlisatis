import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { normalizeCatalog } from '../../public/normalize.js';

// Cloudflare Pages Functions: GET /api/products
const FEED_URL = 'https://cdn.labs-connect.com/feeds/W5I3lNyuyh.xml';
const TTL_SECONDS = 300;
const BACKUP_SECONDS = 7 * 24 * 60 * 60;
const MAX_XML_BYTES = 30 * 1024 * 1024;
const FOREGROUND_TIMEOUT_MS = 30_000; // Manual refresh / first request
const BACKGROUND_TIMEOUT_MS = 18_000; // waitUntil() is not unlimited
const CACHE_VERSION = 'v2';
const parser = new XMLParser({
  ignoreAttributes: true, parseTagValue: false, parseAttributeValue: false,
  trimValues: true, processEntities: true,
  // Never turn EANs/barcodes with leading zeros into numbers.
  cdataPropName: undefined
});

function reply(json, status = 200, cacheState = 'MISS', extra = {}) {
  return new Response(JSON.stringify(json), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'X-POS-Cache': cacheState, ...extra
    }
  });
}

function respondFromCache(response, cacheState, extra = {}) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-POS-Cache', cacheState);
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

async function loadAndNormalize(timeoutMs = FOREGROUND_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetch(FEED_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/xml, text/xml;q=0.9, */*;q=0.5' },
      cache: 'no-store'
    });
    if (!upstream.ok) throw new Error(`XML kaynağı HTTP ${upstream.status} döndürdü.`);
    const contentLength = Number(upstream.headers.get('content-length'));
    if (contentLength > MAX_XML_BYTES) throw new Error('XML boyutu 30 MB sınırını aşıyor.');
    const xml = await upstream.text();
    if (new TextEncoder().encode(xml).byteLength > MAX_XML_BYTES) {
      throw new Error('XML boyutu 30 MB sınırını aşıyor.');
    }
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DOCTYPE/ENTITY içeren XML reddedildi.');
    const valid = XMLValidator.validate(xml);
    if (valid !== true) throw new Error(`Geçersiz XML: ${valid.err?.msg || 'ayrıştırma hatası'}`);
    const normalized = normalizeCatalog(parser.parse(xml));
    return { ...normalized, updatedAt: new Date().toISOString(), source: 'cloudflare-xml' };
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error(`XML sunucusu ${Math.round(timeoutMs / 1000)} saniye içinde yanıt vermedi.`);
      timeoutError.code = 'UPSTREAM_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function saveToCache(context, cache, freshKey, backupKey, data) {
  const body = JSON.stringify(data);
  const asResponse = ttl => new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}`
    }
  });
  // Cache API entries are POP-local, best effort. IndexedDB remains the offline source.
  context.waitUntil(Promise.allSettled([
    cache.put(freshKey, asResponse(TTL_SECONDS)),
    cache.put(backupKey, asResponse(BACKUP_SECONDS))
  ]));
}

function revalidateInBackground(context, cache, freshKey, backupKey) {
  // Return stale data immediately; a cold or slow XML feed must not block POS use.
  context.waitUntil((async () => {
    try {
      const data = await loadAndNormalize(BACKGROUND_TIMEOUT_MS);
      // Wait for cache.puts within this single waitUntil lifecycle.
      const body = JSON.stringify(data);
      await Promise.allSettled([
        cache.put(freshKey, new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${TTL_SECONDS}` } })),
        cache.put(backupKey, new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${BACKUP_SECONDS}` } }))
      ]);
    } catch (error) {
      console.warn('POS background XML refresh failed:', error instanceof Error ? error.message : error);
    }
  })());
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  // Reachability probe: separate Pages Function deployment from feed problems.
  if (url.searchParams.get('health') === '1') {
    return reply({ ok: true, service: 'cep-pos-products', version: 2, xmlFetched: false }, 200, 'HEALTH');
  }
  const refresh = url.searchParams.get('refresh') === '1';
  const freshKey = new Request(new URL(`/__pos-cache/catalog-fresh-${CACHE_VERSION}`, url.origin));
  const backupKey = new Request(new URL(`/__pos-cache/catalog-backup-${CACHE_VERSION}`, url.origin));
  const cache = caches.default;
  try {
    if (!refresh) {
      const fresh = await cache.match(freshKey);
      if (fresh) return respondFromCache(fresh, 'HIT');
      const backup = await cache.match(backupKey);
      if (backup) {
        revalidateInBackground(context, cache, freshKey, backupKey);
        return respondFromCache(backup, 'STALE', { 'X-POS-Refresh': 'BACKGROUND' });
      }
    }
    const data = await loadAndNormalize();
    saveToCache(context, cache, freshKey, backupKey, data);
    return reply(data, 200, refresh ? 'REFRESH' : 'MISS');
  } catch (error) {
    const backup = await cache.match(backupKey).catch(() => null);
    const code = error?.code === 'UPSTREAM_TIMEOUT' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR';
    if (backup) {
      return respondFromCache(backup, 'STALE', { 'X-POS-Fallback-Reason': code });
    }
    return reply({
      error: 'XML kataloğu şu anda alınamadı.', code,
      detail: error instanceof Error ? error.message : 'Bilinmeyen bağlantı hatası.',
      suggestion: 'Kayıtlı kataloğu kullanın veya Yerel XML Yükle seçeneğini deneyin.'
    }, code === 'UPSTREAM_TIMEOUT' ? 504 : 503, 'ERROR', { 'Retry-After': '15' });
  }
}
