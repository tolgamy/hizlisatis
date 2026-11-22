/** Suggested cash tender based on 200 TL steps, using integer kuruş.
 * This is an optional cashier shortcut, not proof that the customer paid.
 */
export function next200Cash(total) {
  const value=Number(total);
  if(!Number.isFinite(value)||value<0)throw new RangeError('Geçersiz satış tutarı');
  const kurus=Math.round(value*100);
  if(!Number.isSafeInteger(kurus))throw new RangeError('Satış tutarı çok yüksek');
  return Math.ceil(kurus/20000)*200;
}
