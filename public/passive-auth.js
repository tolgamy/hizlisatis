/** Simple on-device operation confirmation; not a substitute for server-side access control. */
export function verifyPassivePin(value) {
  return typeof value === 'string' && value.trim() === '1453';
}
