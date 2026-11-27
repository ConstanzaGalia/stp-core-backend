/**
 * Normaliza un teléfono a E.164, pensado para celulares argentinos (WhatsApp).
 *
 * - Sin código de país se asume Argentina: quita el 0 de larga distancia y el 15
 *   del celular, y devuelve `+549` + área + número (10 dígitos nacionales).
 * - Con `+54` / `54` / `0054`, con o sin el 9 de celular: mismo resultado.
 * - Con otro código de país explícito (`+598…`): se acepta si tiene 8–15 dígitos.
 *
 * Devuelve `null` si el número no se puede interpretar.
 */
export function normalizePhoneAR(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || /[a-z]/i.test(trimmed)) return null;

  let digits = trimmed.replace(/\D/g, '');
  let hasCountryCode = trimmed.startsWith('+');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    hasCountryCode = true;
  }
  if (!digits) return null;

  if (hasCountryCode && !digits.startsWith('54')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  let national: string;
  if (digits.startsWith('54') && (hasCountryCode || digits.length >= 12)) {
    national = digits.slice(2);
    if (national.startsWith('9')) national = national.slice(1);
  } else {
    national = digits;
    if (national.startsWith('0')) national = national.slice(1);
    else if (national.length === 11 && national.startsWith('9')) national = national.slice(1);
  }

  national = stripMobilePrefix15(national);

  // Códigos de área argentinos: 11 (AMBA) o empiezan con 2 o 3.
  if (national.length !== 10 || !/^(11|[23])/.test(national)) return null;
  return `+549${national}`;
}

/** Quita el `15` que va entre el código de área (2 a 4 dígitos) y el número. */
function stripMobilePrefix15(national: string): string {
  if (national.length !== 12) return national;
  const areaLengths = national.startsWith('11') ? [2] : [3, 4, 2];
  for (const areaLength of areaLengths) {
    if (national.slice(areaLength, areaLength + 2) === '15') {
      return national.slice(0, areaLength) + national.slice(areaLength + 2);
    }
  }
  return national;
}

/** Link directo de WhatsApp a partir de un teléfono E.164. */
export function buildWhatsAppLink(phoneE164: string): string {
  return `https://wa.me/${phoneE164.replace(/\D/g, '')}`;
}
