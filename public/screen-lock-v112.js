const IDLE=300000,HEARTBEAT=10000,POLL=15000;
let blocked=true;
export function screenBlocked112(){return blocked;}
export async function installScreenLock112(user,{onLock=()=>{}}={}){
 const $=id=>document.getElementById(id),dialog=$('screenLock112'),pin=$('screenPin112'),unlock=$('screenUnlock112'),note=$('screenLockNote112'),retry=$('screenRetry112'),manual=$('screenManual112');
 if(!user?.id){blocked=false;document.body.classList.remove('screen-checking112');return;}
 let configured=false,ended=false,deadline=Date.now()+IDLE,retryUntil=0,lastSent=0,activityTimer=0,chain=Promise.resolve(),started=false,resolveReady,opened=false,previousFocus=null,submitting=false;
 const firstReady=new Promise(resolve=>resolveReady=resolve);
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('hizlisatis-screen-v112'):null;
 function tick(){
  const sec=Math.max(0,Math.ceil((retryUntil-Date.now())/1000));
  retry.textContent=ended?'Kullanıcı oturumunuz sona erdi. Yeniden giriş yapın.':sec?'Yeni deneme için '+sec+' saniye bekleyin.':'';
  unlock.disabled=sec>0||ended||submitting;pin.disabled=ended;$('screenRelogin112').hidden=!ended;
 }
 function show(message=''){
  if(!opened){opened=true;previousFocus=document.activeElement;onLock();pin.value='';}
  blocked=true;document.body.classList.add('screen-blocked112');document.body.classList.remove('screen-checking112');
  if(!dialog.open){dialog.showModal();$('screenLockHeading112').focus({preventScroll:true});}
  if(message)note.textContent=message;tick();
 }
 function release(){
  const wasOpen=opened;blocked=false;opened=false;document.body.classList.remove('screen-blocked112','screen-checking112');
  if(dialog.open)dialog.close();pin.value='';note.textContent='';retry.textContent='';
  if(wasOpen){if(previousFocus?.matches?.('button:not([disabled])')&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});else document.activeElement?.blur?.();}
  previousFocus=null;if(!started){started=true;resolveReady();}
 }
 function apply(d){
  configured=!!d.configured;manual.hidden=!configured;$('screenPinSetup112').textContent=configured?'Ekran PIN’ini değiştir':'4 haneli ekran PIN’i oluştur';
  deadline=Date.now()+Math.max(0,Number(d.remainingMs)||0);retryUntil=Date.now()+Math.max(0,Number(d.retryMs)||0);
  if(d.locked)show();else release();tick();
 }
 const original=window.fetch.bind(window);
 function queue(action,body={}){
  const run=async()=>{try{
   const opts=action==='status'?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body})};
   const r=await original('/api/screen-lock',{cache:'no-store',credentials:'same-origin',...opts}),d=await r.json().catch(()=>({}));
   if(d.code==='AUTH_REQUIRED'){ended=true;show(d.error);return false;}
   if(!r.ok&&!Object.hasOwn(d,'configured')){if(r.status===423)show();throw Error(d.error||'Ekran kilidi bağlantısı kurulamadı.');}
   apply(d);if(d.error){note.textContent=d.error;return false;}
   if(['lock','unlock','configure'].includes(action))channel?.postMessage('changed');return true;
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
 dialog.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target===pin){e.preventDefault();e.stopImmediatePropagation();}});
 unlock.addEventListener('click',async()=>{
  if(submitting||Date.now()<retryUntil||ended)return;
  const value=pin.value;pin.value='';if(!/^\d{4}$/.test(value)){note.textContent='PIN tam 4 rakam olmalı.';return;}
  submitting=true;tick();await queue('unlock',{pin:value});submitting=false;tick();
 });
 $('screenRelogin112').addEventListener('click',()=>location.reload());
 manual.addEventListener('click',()=>{show();queue('lock');});
 $('screenPinSave112').addEventListener('click',async()=>{
  if(blocked||user.role!=='admin')return;
  const a=$('screenNewPin112'),b=$('screenConfirmPin112'),value=a.value,status=$('screenPinStatus112'),save=$('screenPinSave112');
  if(!/^\d{4}$/.test(value)||value!==b.value){status.textContent='Aynı 4 haneli PIN’i iki kez girin.';return;}
  a.value=b.value='';save.disabled=true;try{const ok=await queue('configure',{pin:value});status.textContent=ok?'PIN kaydedildi. Otomatik kilit devrede.':'PIN kaydedilemedi.';}finally{save.disabled=false;}
 });
 channel?.addEventListener('message',()=>queue('status'));
 window.addEventListener('pageshow',()=>queue('status'));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(configured&&Date.now()>=deadline)show();queue('status');}});
 setInterval(()=>{if(configured&&!blocked&&Date.now()>=deadline){show();queue('status');}tick();},500);
 setInterval(()=>{if(!document.hidden&&!ended)queue('status');},POLL);
 window.fetch=async(...args)=>{const r=await original(...args);if(r.status===423){show();queue('status');}return r;};
 document.body.classList.add('screen-checking112');await queue('status');return firstReady;
}
