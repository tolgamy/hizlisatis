/** Transfer only device-local sales and receipt preferences.
 * Managed products, private credentials and D1 customer debt are never included.
 */
export const DEVICE_BACKUP_FORMAT='hizlisatis-device-sales-v1';
export function createDeviceBackup(sales,receiptSettings,createdAt=new Date().toISOString()){
  if(!Array.isArray(sales))throw Error('Satış kayıtları okunamadı.');
  return JSON.stringify({
    format:DEVICE_BACKUP_FORMAT,createdAt,
    scope:'device-local-sales-and-receipt-settings',
    sales,receiptSettings
  });
}
export function parseDeviceBackup(text){
  if(typeof text!=='string'||text.length>50*1024*1024)
    throw Error('Yedek dosyası çok büyük veya okunamıyor (en fazla 50 MB).');
  let data;
  try{data=JSON.parse(text)}catch{throw Error('Geçerli bir HızlıSatış JSON yedeği seçin.');}
  if(data?.format!==DEVICE_BACKUP_FORMAT||!Array.isArray(data.sales))
    throw Error('Bu dosya HızlıSatış cihaz yedeği değil.');
  if(data.sales.length>50000)throw Error('Bu yedekte çok fazla satış kaydı var.');
  const ids=new Set();
  const sales=[];
  for(const row of data.sales){
    if(!row||typeof row!=='object'||
      typeof row.id!=='string'||row.id.length<1||row.id.length>160||
      typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt))||
      typeof row.payment!=='string'||row.payment.length>60||
      !Number.isFinite(row.total)||row.total<0||
      !Array.isArray(row.items)||row.items.length<1||row.items.length>1000)
      throw Error('Yedekte bozuk satış kaydı bulundu. Hiçbir kayıt aktarılmadı.');
    for(const item of row.items){
      if(!item||typeof item.id!=='string'||item.id.length<1||item.id.length>256||
        !Number.isFinite(item.quantity)||item.quantity<=0||item.quantity>1e8)
        throw Error('Yedekte geçersiz satış satırı bulundu. Hiçbir kayıt aktarılmadı.');
    }
    if(ids.has(row.id))continue;
    ids.add(row.id);
    sales.push(row);
  }
  if(!data.receiptSettings||typeof data.receiptSettings!=='object'||
    Array.isArray(data.receiptSettings))throw Error('Fiş ayarları eksik veya bozuk.');
  return {sales,receiptSettings:data.receiptSettings,createdAt:data.createdAt||''};
}
