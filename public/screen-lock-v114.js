const IDLE=300000,HEARTBEAT=10000,POLL=15000;
let blocked=true;
// PIN remains only in this module's transient memory. No input, form,
// hidden credential field, localStorage, sessionStorage, or clipboard.
export function pinStep114(value,key){
 if(key==='clear')return '';
 if(key==='delete')return value.slice(0,-1);
 if(/^[0-9]$/.test(key)&&value.length<4)return value+key;
 return value;
}
export function screenBlocked112(){return blocked;}
export async function installScreenLock112(user,{onLock=()=>{}}={}){
 const $=id=>document.getElementById(id),dialog=$('screenLock112'),dots=$('screenPinDots114'),keypad=$('screenKeypad114'),unlock=$('screenUnlock112'),note=$('screenLockNote112'),retry=$('screenRetry112'),manual=$('screenManual112');
 if(!user?.id){blocked=false;document.body.classList.remove('screen-checking112');return;}
 let configured=false,ended=false,deadline=Date.now()+IDLE,retryUntil=0,lastSent=0,activityTimer=0,chain=Promise.resolve(),started=false,resolveReady,opened=false,previousFocus=null,submitting=false,pendingLock=false,pinValue='',overflow=false;
 const firstReady=new Promise(resolve=>resolveReady=resolve);
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('hizlisatis-screen-v112'):null;
 const keys=Array.from(keypad.querySelectorAll('button[data-pin-key]'));
 const dotNodes=Array.from(dots.children);
 function paint(){
  dotNodes.forEach((node,i)=>{const filled=i<pinValue.length;node.textContent=filled?'●':'○';node.classList.toggle('filled114',filled);});
  dots.setAttribute('aria-label',pinValue.length+' / 4 rakam girildi');
 }
 function clearPin(){pinValue='';overflow=false;paint();}
 function edit(key,physical=false){
  if(!blocked||!dialog.open||ended||submitting||Date.now()<retryUntil)return;
  if(physical&&/^[0-9]$/.test(key)&&pinValue.length===4){clearPin();overflow=true;note.textContent='PIN en fazla 4 rakam. C veya silme tuşuyla yeniden başlayın.';tick();return;}
  if(overflow&&key!=='clear'&&key!=='delete')return;
  overflow=false;pinValue=pinStep114(pinValue,key);note.textContent='';paint();tick();
 }
 function tick(){
  const sec=Math.max(0,Math.ceil((retryUntil-Date.now())/1000));
  retry.textContent=ended?'Kullanıcı oturumunuz sona erdi. Yeniden giriş yapın.':sec?'Yeni deneme için '+sec+' saniye bekleyin.':'';
  const disabled=sec>0||ended||submitting;
  unlock.disabled=disabled||overflow||pinValue.length!==4;
  for(const key of keys)key.disabled=disabled;
  $('screenRelogin112').hidden=!ended;
 }
 function show(message=''){
  if(!opened){opened=true;previousFocus=document.activeElement;onLock();clearPin();}
  blocked=true;document.body.classList.add('screen-blocked112');document.body.classList.remove('screen-checking112');
  if(!dialog.open){dialog.showModal();$('screenLockHeading112').focus({preventScroll:true});}
  if(message)note.textContent=message;tick();
 }
 function release(){
  const wasOpen=opened;blocked=false;opened=false;document.body.classList.remove('screen-blocked112','screen-checking112');
  if(dialog.open)dialog.close();clearPin();note.textContent='';retry.textContent='';
  if(wasOpen){if(previousFocus?.matches?.('button:not([disabled])')&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});else document.activeElement?.blur?.();}
  previousFocus=null;if(!started){started=true;resolveReady();}
 }
 function apply(d){
  configured=!!d.configured;manual.hidden=!configured;
  deadline=Date.now()+Math.max(0,Number(d.remainingMs)||0);retryUntil=Date.now()+Math.max(0,Number(d.retryMs)||0);
  if(d.locked)show();else release();tick();
 }
 const original=window.fetch.bind(window);
 function queue(action,body={}){
  const run=async()=>{try{
   const opts=action==='status'?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})};
   const r=await original('/api/screen-lock',{cache:'no-store',credentials:'same-origin',...opts}),d=await r.json().catch(()=>({}));
   if(d.code==='AUTH_REQUIRED'){ended=true;clearPin();show(d.error);return false;}
   if(d.code==='SCREEN_PIN_CONFIG_REQUIRED'){clearPin();show(d.error);return false;}
   if(!r.ok&&!Object.hasOwn(d,'configured')){if(r.status===423)show();throw Error(d.error||'Ekran kilidi bağlantısı kurulamadı.');}
   if(pendingLock&&!d.locked&&action!=='lock'){show();queue('lock');return false;}
   if(d.locked||action==='lock')pendingLock=false;
   apply(d);if(d.error){note.textContent=d.error;return false;}
   if(['lock','unlock'].includes(action))channel?.postMessage('changed');return true;
  }catch(e){show(e.message+' Bağlantı sağlanınca tekrar kontrol edilecek.');return false;}};
  const next=chain.then(run,run);chain=next.catch(()=>{});return next;
 }
 function sendActivity(){activityTimer=0;if(blocked||!configured||document.hidden)return;lastSent=Date.now();queue('activity');}
 function gate(e){
  if(blocked){if(!dialog.contains(e.target)){if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();}return;}
  if(!configured||!e.isTrusted||document.hidden)return;
  if(Date.now()>=deadline){if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();show();queue('status');return;}
  const elapsed=Date.now()-lastSent;if(elapsed>=HEARTBEAT)sendActivity();else if(!activityTimer)activityTimer=setTimeout(sendActivity,HEARTBEAT-elapsed);
 }
 for(const type of ['pointerdown','keydown','input','wheel','click','submit','touchstart'])window.addEventListener(type,gate,{capture:true,passive:false});
 dialog.addEventListener('cancel',e=>e.preventDefault());
 // Digits from the physical keyboard and numpad never reach POS listeners.
 // Enter is deliberately not an unlock shortcut: HID readers often send Enter.
 dialog.addEventListener('keydown',e=>{
  e.stopPropagation();
  if(e.key==='Enter'){e.preventDefault();if(overflow)clearPin();tick();return;}
  if(e.ctrlKey||e.altKey||e.metaKey||e.isComposing)return;
  if(/^[0-9]$/.test(e.key)){e.preventDefault();if(!e.repeat)edit(e.key,true);return;}
  if(e.key==='Backspace'||e.key==='Delete'||e.key==='Escape'||e.key.toLowerCase()==='c'){
   e.preventDefault();edit(e.key==='Backspace'?'delete':'clear');return;
  }
 });
 for(const key of keys)key.addEventListener('click',()=>edit(key.dataset.pinKey));
 unlock.addEventListener('click',async()=>{
  if(!blocked||!dialog.open||submitting||Date.now()<retryUntil||ended||overflow||pinValue.length!==4)return;
  const value=pinValue;clearPin();
  submitting=true;tick();await queue('unlock',{pin:value});submitting=false;tick();
 });
 $('screenRelogin112').addEventListener('click',()=>location.reload());
 manual.addEventListener('click',()=>{pendingLock=true;show();queue('lock');});
 channel?.addEventListener('message',()=>queue('status'));
 window.addEventListener('pageshow',()=>queue('status'));
 window.addEventListener('hizlisatis:auth-required',()=>queue('status'));
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearPin();tick();}else{if(configured&&Date.now()>=deadline)show();queue('status');}});
 setInterval(()=>{if(configured&&!blocked&&Date.now()>=deadline){show();queue('status');}tick();},500);
 setInterval(()=>{if(!document.hidden&&!ended)queue('status');},POLL);
 window.fetch=async(...args)=>{const r=await original(...args);if(r.status===423){show();queue('status');}return r;};
 document.body.classList.add('screen-checking112');await queue('status');return firstReady;
}
