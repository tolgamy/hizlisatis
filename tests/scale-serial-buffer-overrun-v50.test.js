import test from 'node:test';
import assert from 'node:assert/strict';
import {ScaleSerialConnection} from '../public/scale-serial.js';

const nav={platform:'Win32',serial:{requestPort(){}}};

test('rapid duplicate CAS frames do not flood UI callbacks',()=>{
  const readings=[],raw=[];
  const serial=new ScaleSerialConnection({
    nav,onReading:r=>readings.push(r),onRaw:r=>raw.push(r)
  });
  serial.consume('S 0.562kg\r\n'.repeat(30));
  assert.equal(readings.length,1);
  assert.equal(raw.length,1);
  serial.consume('S 0.750kg\r\n');
  assert.equal(readings.length,2);
  assert.equal(readings[1].grams,750);
});

test('transient Web Serial buffer overrun reacquires a reader and reads stable weight',async()=>{
  let readers=0;
  const received=[],statuses=[],invalid=[];
  const port={
    readable:{
      getReader(){
        const index=++readers;
        let reads=0;
        return {
          async read(){
            if(index===1)throw new Error('Buffer overrun');
            if(reads++===0)return {done:false,value:new TextEncoder().encode('S 0.562kg\r\n')};
            return {done:true};
          },
          releaseLock(){}
        };
      }
    }
  };
  const serial=new ScaleSerialConnection({
    nav,onReading:r=>received.push(r),onStatus:s=>statuses.push(s),
    onUnstable:()=>invalid.push(true)
  });
  serial.port=port;serial.active=true;serial.connected=true;
  await serial.readLoop(port);
  assert.equal(readers,2);
  assert.equal(received.length,1);
  assert.equal(received[0].grams,562);
  assert.equal(invalid.length,1,'overrun invalidates any prior weight');
  assert.ok(statuses.some(s=>s.includes('yeniden deneniyor')));
  assert.equal(serial.connected,false,'ended reader must not leave UI connected');
});

test('repeated buffer overruns stop retries and report disconnected state',async()=>{
  let readers=0;
  const statuses=[];
  const port={
    readable:{
      getReader(){
        readers++;
        return {async read(){throw new Error('Buffer overrun');},releaseLock(){}};
      }
    }
  };
  const serial=new ScaleSerialConnection({nav,onStatus:s=>statuses.push(s)});
  serial.port=port;serial.active=true;serial.connected=true;
  await serial.readLoop(port);
  assert.equal(readers,5);
  assert.equal(serial.connected,false);
  assert.match(statuses.join(' '),/COM portunu yeniden bağlayın/);
});
