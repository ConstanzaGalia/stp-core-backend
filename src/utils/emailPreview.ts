import { buildTestEmailHtml } from './emailBrand';
import {
  approvalStudentEmail,
  inviteStudentEmail,
  notifyTeachersAvailableClassesEmail,
  registerEmail,
  resetPassEmail,
  staffAssociationApprovedEmail,
  staffAssociationRejectedEmail,
  staffAssociationRequestEmail,
} from './emailTemplates';

export type EmailPreviewType =
  | 'register'
  | 'reset'
  | 'invite'
  | 'approval'
  | 'notify'
  | 'staff-request'
  | 'staff-approved'
  | 'staff-rejected'
  | 'test';

const PREVIEW_TYPES: EmailPreviewType[] = [
  'register',
  'reset',
  'invite',
  'approval',
  'notify',
  'staff-request',
  'staff-approved',
  'staff-rejected',
  'test',
];

export function isEmailPreviewType(value: string): value is EmailPreviewType {
  return PREVIEW_TYPES.includes(value as EmailPreviewType);
}

export function buildEmailPreviewHtml(type: EmailPreviewType): string {
  const from = process.env.RESEND_FROM_EMAIL || 'noreply@stp.com';

  switch (type) {
    case 'register':
      return registerEmail('demo@example.com', '123456', 'María', from, 15).html;
    case 'reset':
      return resetPassEmail(
        'demo@example.com',
        'https://entrenamientostp.com/restablecer-password?token=sample',
        'María',
        from,
        60,
      ).html;
    case 'invite':
      return inviteStudentEmail(
        'demo@example.com',
        'María',
        'Centro STP Demo',
        'https://entrenamientostp.com/unirse-centro?token=sample',
        from,
      ).html;
    case 'approval':
      return approvalStudentEmail(
        'demo@example.com',
        'María',
        'Centro STP Demo',
        'https://entrenamientostp.com/dashboard-atleta',
        from,
        '¡Bienvenida al equipo!',
      ).html;
    case 'notify':
      return notifyTeachersAvailableClassesEmail(
        'demo@example.com',
        'Juan',
        'María García',
        'Centro STP Demo',
        3,
        from,
      ).html;
    case 'staff-request':
      return staffAssociationRequestEmail(
        'director@example.com',
        'Carlos',
        'María López',
        'TRAINER',
        'Centro STP Demo',
        'https://entrenamientostp.com/entrenadores',
        from,
        'Me gustaría sumarme al equipo.',
      ).html;
    case 'staff-approved':
      return staffAssociationApprovedEmail(
        'demo@example.com',
        'María',
        'Centro STP Demo',
        'https://entrenamientostp.com/dashboard',
        from,
        '¡Bienvenida al equipo!',
      ).html;
    case 'staff-rejected':
      return staffAssociationRejectedEmail(
        'demo@example.com',
        'María',
        'Centro STP Demo',
        from,
        'Por el momento no tenemos cupo en el staff.',
      ).html;
    case 'test':
      return buildTestEmailHtml();
    default:
      throw new Error(`Unknown preview type: ${type}`);
  }
}
