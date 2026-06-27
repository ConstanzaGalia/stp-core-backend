import {
  escapeHtml,
  renderStpEmailLayout,
  stpButton,
  stpHeading,
  stpInfoBox,
  stpLink,
  stpOtpBox,
  stpParagraph,
  stpWarningBox,
  STP_EMAIL_COLORS,
} from './emailBrand';

export const registerEmail = (email: string, code: string, name: string, from: string, expiresMinutes = 15) => {
  if (!email || email.trim() === '') {
    throw new Error('Email is required for registration email');
  }

  const mail = {
    to: email.trim(),
    subject: '¡Bienvenido a STP!, Confirmá tu email.',
    from,
    html: renderStpEmailLayout({
      title: 'Confirmá tu email',
      preheader: `Tu código de verificación es ${code}`,
      bodyHtml: `
        ${stpHeading(`¡Hola ${name}!`)}
        ${stpParagraph('Estás a un solo paso de formar parte de la mejor comunidad de entrenadores.')}
        ${stpOtpBox(code)}
        ${stpParagraph(`Este código expira en ${expiresMinutes} minutos.`, { muted: true })}
        ${stpParagraph('Si no solicitaste este código, podés ignorar este email.', { muted: true, marginBottom: '0' })}
      `,
    }),
  };
  return mail;
};

export const resetPassEmail = (email: string, url: string, name: string, from: string, expiresMinutes = 60) => {
  if (!email || email.trim() === '') {
    throw new Error('Email is required for reset password email');
  }

  const mail = {
    to: email.trim(),
    subject: '¡Restablecé tu contraseña!',
    from,
    html: renderStpEmailLayout({
      title: 'Restablecer contraseña',
      preheader: 'Solicitaste cambiar tu contraseña en STP',
      bodyHtml: `
        ${stpHeading(`¡Hola ${name}!`)}
        ${stpParagraph('Solicitaste cambiar tu contraseña. Hacé click en el botón para continuar.')}
        ${stpButton(url, 'Restablecer contraseña')}
        ${stpParagraph(`Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br/>${stpLink(url)}`, { muted: true })}
        ${stpParagraph(`Este enlace expira en ${expiresMinutes} minutos.`, { muted: true })}
        ${stpParagraph('Si no solicitaste este cambio, podés ignorar este email.', { muted: true, marginBottom: '0' })}
      `,
    }),
  };
  return mail;
};

export const inviteStudentEmail = (
  email: string,
  name: string,
  companyName: string,
  joinUrl: string,
  from: string,
) => {
  if (!email || email.trim() === '') {
    throw new Error('Email is required for student invitation');
  }

  const safeCompany = escapeHtml(companyName);

  const mail = {
    to: email.trim(),
    subject: `¡${companyName} te invita al centro de entrenamiento!`,
    from,
    html: renderStpEmailLayout({
      title: 'Invitación al centro',
      preheader: `${companyName} te invita a unirte como alumno/a`,
      bodyHtml: `
        ${stpHeading(`¡Hola ${name}!`)}
        ${stpHeading(`¡${companyName} te invita a formar parte de su centro!`, 3)}
        ${stpInfoBox(`
          ${stpParagraph(`Un director de <strong>${safeCompany}</strong> te invitó a unirte como alumno/a a su centro de entrenamiento.`, { align: 'left' })}
          ${stpParagraph('Hacé click en el botón para aceptar la invitación y empezar tu entrenamiento.', { align: 'left', marginBottom: '0' })}
        `)}
        ${stpButton(joinUrl, 'Aceptar invitación')}
        ${stpInfoBox(`
          <p style="margin: 0 0 10px; color: ${STP_EMAIL_COLORS.secondary}; font-size: 15px; font-weight: 700;">¿Qué significa esto?</p>
          <p style="margin: 0 0 10px; color: ${STP_EMAIL_COLORS.text}; font-size: 14px;">Al aceptar esta invitación podrás:</p>
          <ul style="margin: 0; padding-left: 20px; color: ${STP_EMAIL_COLORS.text}; font-size: 14px; line-height: 1.6;">
            <li>Acceder a los planes de entrenamiento del centro</li>
            <li>Reservar clases personalizadas</li>
            <li>Recibir seguimiento personalizado</li>
            <li>Formar parte de la comunidad de ${safeCompany}</li>
          </ul>
        `)}
        ${stpParagraph('Si no te interesa formar parte de este centro, podés ignorar este email.', { muted: true, marginBottom: '0' })}
      `,
    }),
  };
  return mail;
};

export const approvalStudentEmail = (
  email: string,
  name: string,
  companyName: string,
  dashboardUrl: string,
  from: string,
  companyMessage?: string,
) => {
  if (!email || email.trim() === '') {
    throw new Error('Email is required for approval notification');
  }

  const safeCompany = escapeHtml(companyName);
  const messageBlock = companyMessage
    ? stpParagraph(`"${escapeHtml(companyMessage)}"`, { align: 'center', muted: true })
    : '';

  const mail = {
    to: email.trim(),
    subject: `¡Tu solicitud fue aprobada! Ya formás parte de ${companyName}`,
    from,
    html: renderStpEmailLayout({
      title: 'Solicitud aprobada',
      preheader: `Ya formás parte de ${companyName}`,
      bodyHtml: `
        ${stpHeading(`¡Hola ${name}!`)}
        ${stpHeading(`Tu solicitud para unirte a ${companyName} fue aprobada`, 3)}
        ${stpInfoBox(`
          ${stpParagraph('Ya formás parte del centro de entrenamiento. Hacé click en el botón para acceder a tu panel de atleta.', { align: 'left', marginBottom: companyMessage ? '16px' : '0' })}
          ${messageBlock}
        `)}
        ${stpButton(dashboardUrl, 'Ir a mi dashboard')}
        ${stpParagraph('Si no solicitaste unirte a este centro, podés ignorar este email.', { muted: true, marginBottom: '0' })}
      `,
    }),
  };
  return mail;
};

export const notifyTeachersAvailableClassesEmail = (
  email: string,
  trainerName: string,
  studentName: string,
  companyName: string,
  availableClassesCount: number,
  from: string,
) => {
  if (!email || email.trim() === '') {
    throw new Error('Email is required for teacher notification');
  }

  const safeStudent = escapeHtml(studentName);
  const safeCompany = escapeHtml(companyName);
  const classesLabel = `${availableClassesCount} clase${availableClassesCount !== 1 ? 's' : ''}`;

  const mail = {
    to: email.trim(),
    subject: `Clases no reservadas automáticamente - ${studentName}`,
    from,
    html: renderStpEmailLayout({
      title: 'Clases no reservadas',
      preheader: `${studentName} tiene ${classesLabel} sin reservar automáticamente`,
      bodyHtml: `
        ${stpHeading(`¡Hola ${trainerName}!`)}
        ${stpWarningBox(`
          <p style="margin: 0 0 8px; color: ${STP_EMAIL_COLORS.warningText}; font-size: 16px; font-weight: 700;">Atención requerida</p>
          <p style="margin: 0; color: ${STP_EMAIL_COLORS.warningText}; font-size: 15px; line-height: 1.5;">
            Después de procesar el pago de <strong>${safeStudent}</strong> en <strong>${safeCompany}</strong>,
            se crearon <strong>${classesLabel}</strong> que no pudieron reservarse automáticamente.
          </p>
        `)}
        ${stpInfoBox(`
          <p style="margin: 0 0 12px; color: ${STP_EMAIL_COLORS.secondary}; font-size: 16px; font-weight: 700;">¿Qué significa esto?</p>
          <p style="margin: 0 0 12px; color: ${STP_EMAIL_COLORS.text}; font-size: 14px;">Las clases no se pudieron reservar automáticamente debido a:</p>
          <ul style="margin: 0 0 16px; padding-left: 20px; color: ${STP_EMAIL_COLORS.text}; font-size: 14px; line-height: 1.6;">
            <li><strong>Falta de cupo:</strong> los turnos ya estaban completos</li>
            <li><strong>Turnos no cargados:</strong> no se generaron turnos para las fechas correspondientes</li>
          </ul>
          <p style="margin: 0; color: ${STP_EMAIL_COLORS.text}; font-size: 14px; font-weight: 700;">
            El alumno puede reservar estas clases manualmente hasta su fecha de vencimiento.
          </p>
        `)}
        ${stpInfoBox(`
          <p style="margin: 0; color: ${STP_EMAIL_COLORS.infoText}; font-size: 14px; line-height: 1.5;">
            <strong>Recomendación:</strong> verificá que los turnos estén cargados correctamente y que haya cupo disponible para evitar que esto vuelva a ocurrir.
          </p>
        `)}
      `,
    }),
  };
  return mail;
};

export const staffAssociationRequestEmail = (
  directorEmail: string,
  directorName: string,
  applicantName: string,
  applicantRole: string,
  companyName: string,
  reviewUrl: string,
  from: string,
  applicantMessage?: string,
) => {
  if (!directorEmail?.trim()) {
    throw new Error('Email is required for staff association request');
  }

  const messageBlock = applicantMessage
    ? stpParagraph(`Mensaje del solicitante: "${escapeHtml(applicantMessage)}"`, { align: 'left', muted: true })
    : '';

  return {
    to: directorEmail.trim(),
    subject: `Nueva solicitud de asociación — ${companyName}`,
    from,
    html: renderStpEmailLayout({
      title: 'Solicitud de asociación',
      preheader: `${applicantName} quiere unirse a ${companyName}`,
      bodyHtml: `
        ${stpHeading(`¡Hola ${directorName}!`)}
        ${stpParagraph(`<strong>${escapeHtml(applicantName)}</strong> (${escapeHtml(applicantRole)}) solicitó asociarse a <strong>${escapeHtml(companyName)}</strong>.`, { align: 'left' })}
        ${messageBlock}
        ${stpButton(reviewUrl, 'Revisar solicitudes')}
      `,
    }),
  };
};

export const staffAssociationApprovedEmail = (
  email: string,
  name: string,
  companyName: string,
  dashboardUrl: string,
  from: string,
  companyResponse?: string,
) => {
  if (!email?.trim()) {
    throw new Error('Email is required for staff association approval');
  }

  const responseBlock = companyResponse
    ? stpParagraph(`"${escapeHtml(companyResponse)}"`, { align: 'center', muted: true })
    : '';

  return {
    to: email.trim(),
    subject: `¡Tu solicitud fue aprobada! — ${companyName}`,
    from,
    html: renderStpEmailLayout({
      title: 'Solicitud aprobada',
      preheader: `Ya formás parte de ${companyName}`,
      bodyHtml: `
        ${stpHeading(`¡Hola ${name}!`)}
        ${stpParagraph(`Tu solicitud para unirte a <strong>${escapeHtml(companyName)}</strong> fue aprobada.`)}
        ${responseBlock}
        ${stpButton(dashboardUrl, 'Ir al dashboard')}
      `,
    }),
  };
};

export const staffAssociationRejectedEmail = (
  email: string,
  name: string,
  companyName: string,
  from: string,
  companyResponse?: string,
) => {
  if (!email?.trim()) {
    throw new Error('Email is required for staff association rejection');
  }

  const responseBlock = companyResponse
    ? stpParagraph(`"${escapeHtml(companyResponse)}"`, { align: 'center', muted: true })
    : '';

  return {
    to: email.trim(),
    subject: `Actualización de tu solicitud — ${companyName}`,
    from,
    html: renderStpEmailLayout({
      title: 'Solicitud no aprobada',
      preheader: `Tu solicitud para ${companyName} no fue aprobada`,
      bodyHtml: `
        ${stpHeading(`¡Hola ${name}!`)}
        ${stpParagraph(`Tu solicitud para unirte a <strong>${escapeHtml(companyName)}</strong> no fue aprobada en este momento.`)}
        ${responseBlock}
        ${stpParagraph('Podés contactar al director del centro si tenés dudas.', { muted: true, marginBottom: '0' })}
      `,
    }),
  };
};
