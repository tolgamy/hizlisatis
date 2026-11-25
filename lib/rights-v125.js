import {decodePermissions} from './permissions-v121.js';
import {hasPermission} from './user-access.js';
export function fine125(u,id,legacy){
 if(!u?.active)return false;
 if(u.role==='admin')return true;
 const p=decodePermissions(u.permissions);
 return p.profile===null?Boolean(legacy&&hasPermission(u,legacy)):p.profile.includes(id);
}
export const lookup125=u=>fine125(u,'customer.lookup','customers');
export const credit125=u=>lookup125(u)&&fine125(u,'customer.credit','customers')&&hasPermission(u,'sales');
export const collect125=u=>lookup125(u)&&fine125(u,'customer.collect','customers');
export function reportScope125(u){
 if(!u?.active)return null;
 if(u.role==='admin'||hasPermission(u,'reports'))return 'all';
 if(fine125(u,'report.all'))return 'all';
 if(fine125(u,'report.own')&&fine125(u,'report.other'))return 'all';
 if(fine125(u,'report.own'))return 'own';
 if(fine125(u,'report.other'))return 'other';
 return null;
}
export const payment125=(u,p)=>u?.role==='admin'||decodePermissions(u?.permissions).profile===null||((p==='Nakit'&&fine125(u,'sale.cash'))||(p==='Kart'&&fine125(u,'sale.card'))||(p==='Veresiye'&&credit125(u)));

export const dailyScope125=u=>u?.active&&(u.role==='admin'||hasPermission(u,'reports')||fine125(u,'report.all'))?'all':fine125(u,'report.daily.own')?'own':null;
