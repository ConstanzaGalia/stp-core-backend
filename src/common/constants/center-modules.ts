/** IDs de módulos configurables por centro (accesos directos). */
export const CONFIGURABLE_CENTER_MODULE_IDS = [
  'atletas',
  'evaluaciones-centro',
  'entrenadores',
  'ejercicios',
  'turnos',
  'pagos',
  'mis-centros',
  'configuracion-centro',
  'configurar-horarios',
  'productos',
  'estadisticas',
  'divisiones',
  'posiciones',
  'criterios-evaluacion',
] as const;

export type ConfigurableCenterModuleId = (typeof CONFIGURABLE_CENTER_MODULE_IDS)[number];

export function isConfigurableCenterModuleId(value: string): value is ConfigurableCenterModuleId {
  return (CONFIGURABLE_CENTER_MODULE_IDS as readonly string[]).includes(value);
}
