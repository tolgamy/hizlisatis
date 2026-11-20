import test from 'node:test';import assert from 'node:assert/strict';
import {parseLocaleNumber,safeImageUrl} from '../public/normalize.js';
test('Turkish and international numbers parse without losing negative values',()=>{
 assert.equal(parseLocaleNumber('1.234,50'),1234.5);
 assert.equal(parseLocaleNumber('199.95'),199.95);
 assert.equal(parseLocaleNumber('-5,25'),-5.25);
});
test('reject malicious image URLs, retain ordinary https photographs',()=>{
 assert.equal(safeImageUrl('javascript:alert(1)'),'');
 assert.equal(safeImageUrl('https://example.com/a.jpg'),'https://example.com/a.jpg');
});
