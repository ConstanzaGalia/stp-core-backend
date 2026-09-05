-- Dry-run: candidatos a reclasificar. Solo SELECT — no modifica datos.
-- Revisá lotes A/B (propuestos) y C (decidir a mano) antes de correr apply-*.sql

-- === LOTE A → Levantamiento olímpico / Derivado olímpico ===
SELECT e.id, e.name,
       c.name AS category_hoy,
       mp.name AS pattern_hoy,
       'Levantamiento olímpico' AS category_propuesta,
       'Derivado olímpico' AS pattern_propuesto,
       'A' AS lote
FROM exercise e
LEFT JOIN category c ON c.id = e."primaryCategoryId"
LEFT JOIN movement_pattern mp ON mp.id = e."movementPatternId"
WHERE e.name IN (
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
ORDER BY e.name;

-- === LOTE B → Balísticos / Balístico ===
-- (excluye Lagartijas con medicine ball — queda en grises / no balístico)
SELECT e.id, e.name,
       c.name AS category_hoy,
       mp.name AS pattern_hoy,
       'Balísticos' AS category_propuesta,
       'Balístico' AS pattern_propuesto,
       'B' AS lote
FROM exercise e
LEFT JOIN category c ON c.id = e."primaryCategoryId"
LEFT JOIN movement_pattern mp ON mp.id = e."movementPatternId"
WHERE e.name IN (
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
ORDER BY e.name;

-- === LOTE C — se mantienen como están (no aplicar) ===
-- Push press, Thruster, OH squat, Sentadilla de arranque, Turco, Devil press, Lagartijas MB

-- === LOTE D — saltos → ver apply-reclassify-plyometric-lote-d.sql ===
-- Burpees + salto al cajón se mantiene Metabólico / Compuestos
