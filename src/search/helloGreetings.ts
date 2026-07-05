// i18n keys for the one-time boot greeting shown in the top search bar. The
// first-ever boot uses HELLO_FIRST_KEY; every later new boot picks a random
// entry from HELLO_POOL_KEYS. Text comes from t(key) at render time.
export const HELLO_FIRST_KEY = 'hello.first';

export const HELLO_POOL_KEYS = [
  'hello.g01', 'hello.g02', 'hello.g03', 'hello.g04', 'hello.g05',
  'hello.g06', 'hello.g07', 'hello.g08', 'hello.g09', 'hello.g10',
  'hello.g11', 'hello.g12', 'hello.g19', 'hello.g20', 'hello.g21',
  'hello.g23', 'hello.g24', 'hello.g25', 'hello.g27', 'hello.g28',
  'hello.g32', 'hello.g35', 'hello.g36', 'hello.g37', 'hello.g38',
  'hello.g39', 'hello.g41', 'hello.g42', 'hello.g43', 'hello.g44',
  'hello.g45', 'hello.g46', 'hello.g48', 'hello.g49', 'hello.g50',
  'hello.g52', 'hello.g53', 'hello.g54', 'hello.g55', 'hello.g56',
  'hello.g57', 'hello.g58', 'hello.g59', 'hello.g60', 'hello.g61',
  'hello.g62', 'hello.g65', 'hello.g67', 'hello.g71', 'hello.g72',
  'hello.g74', 'hello.g76', 'hello.g78', 'hello.g79',
] as const;

export function randomHelloPoolKey(): string {
  return HELLO_POOL_KEYS[Math.floor(Math.random() * HELLO_POOL_KEYS.length)];
}
