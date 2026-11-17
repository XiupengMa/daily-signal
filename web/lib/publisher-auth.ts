// This is server-side publisher authorization, independent of Site visibility.
// Sites consumes OAI-Sites-Authorization before invoking the Worker. Publishers
// must also send the same credential in Authorization.
export async function publisherAuthorized(request: Request, expectedHash?: string): Promise<boolean> {
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  const authorization = request.headers.get('authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) return false;
  const token = authorization.slice(7);
  if (token.length < 32 || token.length > 4096 || /\s/.test(token)) return false;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  let difference = 0;
  for (let i = 0; i < digest.length; i++) difference |= digest[i] ^ parseInt(expectedHash.slice(i * 2, i * 2 + 2), 16);
  return difference === 0;
}

export function sameOriginWrite(request: Request): boolean {
  const origin = request.headers.get('origin');
  return (!origin || origin === new URL(request.url).origin) && request.headers.get('sec-fetch-site') !== 'cross-site';
}

export async function readLimitedJson(request: Request, maxBytes: number): Promise<unknown> {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new RangeError('Request too large');
  if (!request.body) throw new SyntaxError('Missing body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new RangeError('Request too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
}
