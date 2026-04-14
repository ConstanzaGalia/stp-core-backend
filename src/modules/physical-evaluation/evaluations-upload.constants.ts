/**
 * Variables de entorno (documentación):
 * - EVALUATIONS_UPLOAD_DIR: ruta absoluta o relativa al cwd donde guardar archivos (default: `uploads/evaluations`).
 * - EVALUATIONS_MAX_FILE_MB: tamaño máximo por archivo en MB (default: 25).
 *
 * Compatibilidad API: el alta manual con JSON sigue disponible en `POST /physical-evaluations/:userId`
 * (no usada en la UI de staff). El flujo por archivos usa `POST /evaluaciones` y `POST /evaluaciones/:id/upload`.
 *
 * PDF: se usa `pdf-parse@1.1.x` (Buffer en Node). No subir a la v2 en este proyecto sin polyfills DOM.
 */
export const DEFAULT_EVALUATIONS_UPLOAD_DIR = 'uploads/evaluations';
export const DEFAULT_EVALUATIONS_MAX_FILE_MB = 25;
export const EVALUATIONS_MAX_FILES_PER_REQUEST = 20;

export const ALLOWED_EVALUATION_MIMETYPES = new Set([
  'application/pdf',
  'text/csv',
  'text/plain', // algunos CSV
  'application/vnd.ms-excel',
]);
