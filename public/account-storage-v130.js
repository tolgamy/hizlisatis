let accountId='';

export function setAccountStorage130(id){
  accountId=id||'';
}

export function accountStorage130(){
  const store=globalThis.localStorage;
  if(!accountId)return store;
  const prefix='hizlisatis:account:'+encodeURIComponent(accountId)+':';
  return {
    getItem:key=>store.getItem(prefix+key),
    setItem:(key,value)=>store.setItem(prefix+key,value),
    removeItem:key=>store.removeItem(prefix+key)
  };
}

export function accountId130(){
  return accountId;
}
