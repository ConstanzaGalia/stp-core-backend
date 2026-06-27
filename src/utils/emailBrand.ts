export const STP_EMAIL_COLORS = {
  primary: '#00b5ad',
  primaryHover: '#009b94',
  secondary: '#003946',
  text: '#4b5563',
  textMuted: '#6b7280',
  background: '#f4f7f7',
  surface: '#ffffff',
  accentSurface: '#f1fffd',
  border: '#e5e7eb',
  warningBg: '#fff8e6',
  warningBorder: '#f59e0b',
  warningText: '#92400e',
  infoBg: '#f1fffd',
  infoBorder: '#00b5ad',
  infoText: '#003946',
};

const DEFAULT_LOGO_PATH = '/landing/logo-stp.png';
const CONTACT_EMAIL = 'entrenamientostp@gmail.com';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getEmailLogoUrl(): string {
  if (process.env.EMAIL_LOGO_URL?.trim()) {
    return process.env.EMAIL_LOGO_URL.trim();
  }
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
  return `${frontendUrl}${DEFAULT_LOGO_PATH}`;
}

export function stpHeading(text: string, level: 2 | 3 = 2): string {
  const tag = level === 2 ? 'h2' : 'h3';
  const fontSize = level === 2 ? '22px' : '18px';
  return `<${tag} style="margin: 0 0 12px; color: ${STP_EMAIL_COLORS.secondary}; font-size: ${fontSize}; font-weight: 700; text-align: center; line-height: 1.3;">${escapeHtml(text)}</${tag}>`;
}

export function stpParagraph(
  text: string,
  options?: { align?: 'left' | 'center'; muted?: boolean; marginBottom?: string },
): string {
  const align = options?.align ?? 'center';
  const color = options?.muted ? STP_EMAIL_COLORS.textMuted : STP_EMAIL_COLORS.text;
  const marginBottom = options?.marginBottom ?? '16px';
  return `<p style="margin: 0 0 ${marginBottom}; color: ${color}; font-size: 16px; line-height: 1.5; text-align: ${align};">${text}</p>`;
}

export function stpButton(href: string, label: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 24px auto;">
      <tr>
        <td style="border-radius: 8px; background-color: ${STP_EMAIL_COLORS.primary};">
          <a href="${href}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 8px; background-color: ${STP_EMAIL_COLORS.primary};">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

export function stpOtpBox(code: string): string {
  return `
    <div style="background-color: ${STP_EMAIL_COLORS.accentSurface}; border: 1px solid ${STP_EMAIL_COLORS.infoBorder}; border-radius: 12px; padding: 28px 24px; text-align: center; margin: 28px 0;">
      <p style="margin: 0 0 16px; color: ${STP_EMAIL_COLORS.textMuted}; font-size: 15px;">Ingresá el siguiente código para confirmar tu email:</p>
      <div style="display: inline-block; background-color: ${STP_EMAIL_COLORS.secondary}; color: #ffffff; padding: 14px 28px; border-radius: 8px; font-size: 28px; font-weight: 700; letter-spacing: 6px;">
        ${escapeHtml(code)}
      </div>
    </div>
  `;
}

export function stpInfoBox(html: string): string {
  return `
    <div style="background-color: ${STP_EMAIL_COLORS.accentSurface}; border: 1px solid ${STP_EMAIL_COLORS.border}; border-radius: 12px; padding: 24px; margin: 24px 0;">
      ${html}
    </div>
  `;
}

export function stpWarningBox(html: string): string {
  return `
    <div style="background-color: ${STP_EMAIL_COLORS.warningBg}; border-left: 4px solid ${STP_EMAIL_COLORS.warningBorder}; padding: 20px; border-radius: 8px; margin: 24px 0;">
      ${html}
    </div>
  `;
}

export function stpLink(href: string, label?: string): string {
  const display = label ?? href;
  return `<a href="${href}" style="color: ${STP_EMAIL_COLORS.primary}; word-break: break-all;">${escapeHtml(display)}</a>`;
}

export function renderStpEmailLayout(options: {
  title: string;
  bodyHtml: string;
  preheader?: string;
}): string {
  const logoUrl = getEmailLogoUrl();
  const preheader = options.preheader
    ? escapeHtml(options.preheader)
    : escapeHtml(options.title);

  return `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(options.title)} - STP</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: ${STP_EMAIL_COLORS.background}; font-family: Arial, Helvetica, sans-serif;">
        <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
          ${preheader}
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${STP_EMAIL_COLORS.background}; padding: 32px 16px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: ${STP_EMAIL_COLORS.surface}; border-radius: 12px; overflow: hidden; border: 1px solid ${STP_EMAIL_COLORS.border};">
                <tr>
                  <td style="height: 4px; background-color: ${STP_EMAIL_COLORS.secondary}; font-size: 0; line-height: 0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding: 36px 32px 24px; text-align: center;">
                    <img src="${logoUrl}" alt="STP Health &amp; Performance" width="140" style="display: block; margin: 0 auto 12px; max-width: 140px; height: auto; border: 0;">
                    <p style="margin: 0; color: ${STP_EMAIL_COLORS.textMuted}; font-size: 13px; letter-spacing: 0.4px;">Health &amp; Performance</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 32px 32px;">
                    ${options.bodyHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 32px 28px; border-top: 1px solid ${STP_EMAIL_COLORS.border}; text-align: center;">
                    <p style="margin: 0 0 6px; color: ${STP_EMAIL_COLORS.textMuted}; font-size: 12px;">
                      © STP · ${CONTACT_EMAIL}
                    </p>
                    <p style="margin: 0; color: ${STP_EMAIL_COLORS.textMuted}; font-size: 12px;">
                      Este es un email automático, por favor no respondas a este mensaje.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export function buildTestEmailHtml(): string {
  return renderStpEmailLayout({
    title: 'Test de email STP',
    preheader: 'Verificación de envío con Resend',
    bodyHtml: `
      ${stpHeading('¡Test de email exitoso!')}
      ${stpParagraph('Este es un email de prueba para verificar que Resend y el diseño de marca STP están funcionando correctamente.')}
      ${stpInfoBox(`
        ${stpParagraph('Si ves el logo y los colores teal (#00b5ad) y oscuro (#003946), el branding quedó aplicado.', { align: 'left', marginBottom: '0' })}
      `)}
      ${stpButton('https://entrenamientostp.com', 'Visitar STP')}
    `,
  });
}
