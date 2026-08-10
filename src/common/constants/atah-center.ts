/** Centro ATAH — portal analytics de entrenadores de club. */
export const ATAH_CENTER_ID = 'ea3a67be-d5f9-4f5e-b41b-ede061095b8a';

export function isAtahCenter(companyId: string | null | undefined): boolean {
  return Boolean(companyId && companyId === ATAH_CENTER_ID);
}
