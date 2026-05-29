/** Centro STP principal — contexto operativo por defecto del STP_ADMIN. */
export const DEFAULT_STP_OPERATING_COMPANY_ID =
  '7623d786-23a5-447b-b970-bb58ee2a70ac';

export function getStpOperatingCompanyId(): string {
  return (
    process.env.STP_OPERATING_COMPANY_ID?.trim() ||
    DEFAULT_STP_OPERATING_COMPANY_ID
  );
}
