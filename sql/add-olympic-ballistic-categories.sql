-- Fase 0: catálogo (categorías + patrones). No toca ejercicios.
-- Idempotente: solo inserta si el nombre aún no existe.

INSERT INTO category (name, description)
SELECT 'Levantamiento olímpico',
       'Levantamientos olímpicos y derivados (arranque, cargada, etc.)'
WHERE NOT EXISTS (
  SELECT 1 FROM category WHERE name = 'Levantamiento olímpico'
);

INSERT INTO category (name, description)
SELECT 'Balísticos',
       'Producción rápida de fuerza: swings, slams, lanzamientos de balón'
WHERE NOT EXISTS (
  SELECT 1 FROM category WHERE name = 'Balísticos'
);

INSERT INTO movement_pattern (name, description)
SELECT 'Derivado olímpico',
       'Arranque, cargadas, tirones y derivados de levantamiento olímpico'
WHERE NOT EXISTS (
  SELECT 1 FROM movement_pattern WHERE name = 'Derivado olímpico'
);

INSERT INTO movement_pattern (name, description)
SELECT 'Balístico',
       'Swings, slams y lanzamientos con aceleración de carga (no pliometría)'
WHERE NOT EXISTS (
  SELECT 1 FROM movement_pattern WHERE name = 'Balístico'
);

-- Verificación
SELECT id, name, 'category' AS kind FROM category
WHERE name IN ('Levantamiento olímpico', 'Balísticos')
UNION ALL
SELECT id, name, 'pattern' FROM movement_pattern
WHERE name IN ('Derivado olímpico', 'Balístico')
ORDER BY kind, name;
