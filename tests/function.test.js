import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Node dependencies are installed automatically by Cloudflare Pages and after
// `npm install`. In code-review-only environments this test skips cleanly.
let handler;
try { ({ onRequestGet: handler } = await import('../functions/api/products.js')); }
catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

test('Pages Function parses multi-variant XML, caches, refreshes and falls back',
  { skip: !handler && 'Run npm install to enable the integrated parser test' },
  async () => {
    const xml = await readFile(new URL('../fixtures/sample-products.xml', import.meta.url), 'utf8');
    const store = new Map();
    const oldCache = globalThis.caches;
    const oldFetch = globalThis.fetch;
    let fetchCount = 0;
    let originFails = false;
    const pending = [];
    const context = suffix => ({
      request: new Request(`https://pos.example/api/products${suffix}`),
      waitUntil: promise => pending.push(promise)
    });
    globalThis.caches = { default: {
      match: async key => store.get(key.url)?.clone() || null,
      put: async (key, response) => { store.set(key.url, response.clone()); }
    } };
    globalThis.fetch = async () => {
      fetchCount++;
      if (originFails) throw new Error('test origin is offline');
      return new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } });
    };
    try {
      const health = await handler(context('?health=1'));
      assert.equal(health.status, 200);
      assert.equal((await health.json()).ok, true);
      assert.equal(fetchCount, 0); // health check must never call the XML feed

      let response = await handler(context(''));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('X-POS-Cache'), 'MISS');
      let json = await response.json();
      assert.equal(json.products.length, 3);
      assert.equal(json.products[0].barkod, '08691234567890');
      assert.equal(json.products[0].aciklamaMetin, 'Bol fındıklı tat!');
      await Promise.all(pending.splice(0));

      response = await handler(context(''));
      assert.equal(response.headers.get('X-POS-Cache'), 'HIT');
      assert.equal(fetchCount, 1);
      await response.json();

      response = await handler(context('?refresh=1'));
      assert.equal(response.headers.get('X-POS-Cache'), 'REFRESH');
      assert.equal(fetchCount, 2);
      await response.json();
      await Promise.all(pending.splice(0));

      const fresh = [...store.keys()].find(url => url.includes('catalog-fresh-v1'));
      store.delete(fresh);
      originFails = true;
      response = await handler(context(''));
      assert.equal(response.headers.get('X-POS-Cache'), 'STALE');
      json = await response.json();
      assert.equal(json.variantCount, 3);
    } finally {
      globalThis.fetch = oldFetch;
      globalThis.caches = oldCache;
    }
  });
