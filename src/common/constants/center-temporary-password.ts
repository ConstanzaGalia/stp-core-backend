export const DEFAULT_CENTER_TEMPORARY_PASSWORD = 'EntrenamientoSTP1@';

export function resolveCenterTemporaryPassword(
  company?: { temporaryPassword?: string | null } | null,
): string {
  const custom = company?.temporaryPassword?.trim();
  return custom || DEFAULT_CENTER_TEMPORARY_PASSWORD;
}
