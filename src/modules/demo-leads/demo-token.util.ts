import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Token firmado que habilita a un navegador a registrar eventos de la demo
 * para un lead puntual. Usa una clave derivada con propósito propio, así
 * nunca sirve como token de sesión de la app (AuthGuard('jwt')).
 */
const PURPOSE = 'stp-demo-lead-token:v1';

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(`${PURPOSE}:${secret}`).digest();
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', deriveKey(secret)).update(payload).digest('base64url');
}

export function createDemoLeadToken(
  leadId: string,
  secret: string,
  ttlMs: number,
  now: number = Date.now(),
): string {
  const payload = Buffer.from(JSON.stringify({ l: leadId, e: now + ttlMs })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

/** Devuelve el id del lead si el token es válido y no venció; si no, `null`. */
export function verifyDemoLeadToken(
  token: string | null | undefined,
  secret: string,
  now: number = Date.now(),
): string | null {
  if (typeof token !== 'string') return null;
  const [payload, signature, ...rest] = token.split('.');
  if (!payload || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(payload, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof decoded?.l !== 'string' || typeof decoded?.e !== 'number') return null;
    if (decoded.e < now) return null;
    return decoded.l;
  } catch {
    return null;
  }
}

/** Hash de la IP para el límite de pedidos: no guardamos IPs en claro. */
export function hashIp(ip: string, secret: string): string {
  return createHash('sha256').update(`stp-demo-ip:${secret}:${ip}`).digest('hex');
}
