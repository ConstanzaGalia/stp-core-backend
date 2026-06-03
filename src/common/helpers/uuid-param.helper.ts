const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Quita espacios y comillas al copiar/pegar IDs (ej. "7623d786-..."). */
export function sanitizeUuidParam(value: unknown): string {
  if (value == null) {
    return '';
  }
  return String(value)
    .trim()
    .replace(/^["']+|["']+$/g, '');
}

export function isValidUuidParam(value: string): boolean {
  return UUID_REGEX.test(sanitizeUuidParam(value));
}
