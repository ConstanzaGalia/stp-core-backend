-- APPLY lotes A + B (tras tu OK). No toca lote C.
-- Requiere haber corrido antes: sql/add-olympic-ballistic-categories.sql
-- Idempotente respecto a destino: puede re-ejecutarse.
-- No setea fase_recomendada: el motor excluye estos grupos de ADAPT/HYP/FUERZA
-- por categoría/patrón; el entrenador puede seguir agregándolos a mano.

BEGIN;

WITH cat AS (
  SELECT id FROM category WHERE name = 'Levantamiento olímpico' LIMIT 1
),
pat AS (
  SELECT id FROM movement_pattern WHERE name = 'Derivado olímpico' LIMIT 1
)
UPDATE exercise e
SET
  "primaryCategoryId" = (SELECT id FROM cat),
  "movementPatternId" = (SELECT id FROM pat)
WHERE trim(e.name) IN (
  'Arranque de potencia (parado)',
  'Arranque de potencia (parado) con MC',
  'Cargada + 2do Tiempo potencia',
  'Cargada de potencia (desde suelo)',
  'Cargada de potencia (parado)',
  'Clean con barra',
  'Clean con mancuernas',
  'Clean unilateral con mancuerna',
  'Snatch con barra',
  'Snatch con mancuerna',
  'Snatch con polea',
  'Tirones de cargada'
)
AND (SELECT id FROM cat) IS NOT NULL
AND (SELECT id FROM pat) IS NOT NULL;

WITH cat AS (
  SELECT id FROM category WHERE name = 'Balísticos' LIMIT 1
),
pat AS (
  SELECT id FROM movement_pattern WHERE name = 'Balístico' LIMIT 1
)
UPDATE exercise e
SET
  "primaryCategoryId" = (SELECT id FROM cat),
  "movementPatternId" = (SELECT id FROM pat)
WHERE trim(e.name) IN (
  'Kettlebell swing',
  'Lanzamiento SB a pared 2 manos',
  'Lanzamiento SB a pared 2 manos con rotacion',
  'Lanzamiento Sb al suelo 2 mano',
  'Lanzamiento Sb al suelo 2 mano con rotacion',
  'Lanzomed a pared 1 mano',
  'Lanzomed arriba + ganchos',
  'LANZOMED ARRIBA-ABAJO explosivo',
  'Lanzomed de frente a 2m, de rodillas',
  'Lanzomed de rodillas (de lado a lado)',
  'LANZOMED lateral',
  'Swing a 1M',
  'Swing con mancuerna',
  'Swing unilateral'
)
AND (SELECT id FROM cat) IS NOT NULL
AND (SELECT id FROM pat) IS NOT NULL;

-- Verificación post-apply
SELECT e.name, c.name AS category, mp.name AS pattern
FROM exercise e
LEFT JOIN category c ON c.id = e."primaryCategoryId"
LEFT JOIN movement_pattern mp ON mp.id = e."movementPatternId"
WHERE c.name IN ('Levantamiento olímpico', 'Balísticos')
   OR mp.name IN ('Derivado olímpico', 'Balístico')
ORDER BY c.name, e.name;

COMMIT;
