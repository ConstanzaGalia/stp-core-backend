-- Opcional: agrega programas-grupales a centros con lista explícita de módulos
-- (sin depender del alias planes-entrenamiento → programas-grupales en el front).
-- Ejecutar solo si querés el toggle independiente en Configuración del centro.

UPDATE company
SET enabled_modules = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM (
    SELECT jsonb_array_elements_text(
      COALESCE(enabled_modules, '[]'::jsonb)
    ) AS elem
    UNION ALL
    SELECT 'programas-grupales'
  ) s
)::jsonb
WHERE enabled_modules IS NOT NULL
  AND jsonb_array_length(enabled_modules) > 0
  AND NOT (enabled_modules @> '["programas-grupales"]'::jsonb);
