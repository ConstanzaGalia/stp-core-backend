/** Mismo criterio que PostgreSQL uuid: 8-4-4-4-12 hex. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UUID_IN_TEXT_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function toAsciiHyphens(value: string): string {
  return value.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
}

function stripInvisibleChars(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, '');
}

/** Quita espacios y comillas al copiar/pegar IDs (ej. "7623d786-..."). */
export function sanitizeUuidParam(value: unknown): string {
  if (value == null) {
    return '';
  }
  const trimmed = stripInvisibleChars(toAsciiHyphens(String(value)))
    .trim()
    .replace(/^["']+|["']+$/g, '');
  const match = trimmed.match(UUID_IN_TEXT_REGEX);
  if (match) {
    return match[0].toLowerCase();
  }
  return trimmed.replace(/\s/g, '').toLowerCase();
}

export function isValidUuidParam(value: string): boolean {
  return UUID_REGEX.test(sanitizeUuidParam(value));
}
