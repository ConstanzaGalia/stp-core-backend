import { createDemoLeadToken, hashIp, verifyDemoLeadToken } from './demo-token.util';

const SECRET = 'test-secret';
const LEAD_ID = '6f1c2a8e-1b2c-4d5e-8f90-123456789abc';

describe('demo lead token', () => {
  it('verifica un token propio y devuelve el id del lead', () => {
    const token = createDemoLeadToken(LEAD_ID, SECRET, 60_000, 1_000);
    expect(verifyDemoLeadToken(token, SECRET, 2_000)).toBe(LEAD_ID);
  });

  it('rechaza tokens vencidos', () => {
    const token = createDemoLeadToken(LEAD_ID, SECRET, 60_000, 1_000);
    expect(verifyDemoLeadToken(token, SECRET, 61_001)).toBeNull();
  });

  it('rechaza tokens firmados con otra clave', () => {
    const token = createDemoLeadToken(LEAD_ID, 'otra-clave', 60_000);
    expect(verifyDemoLeadToken(token, SECRET)).toBeNull();
  });

  it('rechaza tokens con el contenido alterado', () => {
    const token = createDemoLeadToken(LEAD_ID, SECRET, 60_000);
    const [, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ l: 'otro-lead', e: Date.now() + 60_000 })).toString('base64url');
    expect(verifyDemoLeadToken(`${forged}.${signature}`, SECRET)).toBeNull();
  });

  it.each([[''], ['sin-punto'], ['a.b.c'], [null], [undefined]])('rechaza %p', (token) => {
    expect(verifyDemoLeadToken(token as string, SECRET)).toBeNull();
  });
});

describe('hashIp', () => {
  it('es estable y no expone la IP', () => {
    const hash = hashIp('200.1.2.3', SECRET);
    expect(hash).toBe(hashIp('200.1.2.3', SECRET));
    expect(hash).not.toContain('200.1.2.3');
    expect(hash).toHaveLength(64);
    expect(hashIp('200.1.2.4', SECRET)).not.toBe(hash);
  });
});
