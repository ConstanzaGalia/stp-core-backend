-- Persiste programas-grupales en centros que ya tenían planes de entrenamiento
-- y una lista explícita de módulos. Así el toggle del panel de centros queda
-- independiente, sin apagar el módulo en los centros que ya lo usaban.

UPDATE company
SET enabled_modules = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM (
    SELECT jsonb_array_elements_text(enabled_modules) AS elem
    UNION ALL
    SELECT 'programas-grupales'
  ) s
)
WHERE enabled_modules IS NOT NULL
  AND jsonb_typeof(enabled_modules) = 'array'
  AND jsonb_array_length(enabled_modules) > 0
  AND enabled_modules @> '["planes-entrenamiento"]'::jsonb
  AND NOT (enabled_modules @> '["programas-grupales"]'::jsonb);
