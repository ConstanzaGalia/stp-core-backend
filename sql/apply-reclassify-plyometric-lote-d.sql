-- Lote D: saltos/pliometría mal categorizados → Pliométrico / Saltos y Rebotes
-- NO toca: Burpees + salto al cajón (queda Metabólico / Compuestos)
-- NO toca: fondos/puentes/subidas en cajón (soporte, no salto)
-- NO toca: jacks / skipping / soga / burpees simples (metabólicos)

BEGIN;

WITH cat AS (
  SELECT id FROM category WHERE name = 'Pliométrico' LIMIT 1
),
pat AS (
  SELECT id FROM movement_pattern WHERE name = 'Saltos y Rebotes' LIMIT 1
)
UPDATE exercise e
SET
  "primaryCategoryId" = (SELECT id FROM cat),
  "movementPatternId" = (SELECT id FROM pat)
WHERE e.name IN (
  'Esquiador + salto vertical 1P',
  'Caida del cajón + salto 3 vallas',
  'Multisaltos pliometricos',
  'Caida del cajón + salto 1 valla',
  'Caida del cajón + salto 2 vallas',
  'Caida del cajón + salto al frente',
  'Caida del cajon + salto en el lugar',
  'Caida del cajón a 1 pie',
  'Caida del cajón y quedo en sentadilla',
  'Salto 1 pie al cajón',
  'Estocadas con salto + oblícuos',
  'Sentadilla con salto',
  'Sentadilla con salto + giro'
)
AND (SELECT id FROM cat) IS NOT NULL
AND (SELECT id FROM pat) IS NOT NULL;

SELECT e.name, c.name AS category, mp.name AS pattern
FROM exercise e
LEFT JOIN category c ON c.id = e."primaryCategoryId"
LEFT JOIN movement_pattern mp ON mp.id = e."movementPatternId"
WHERE e.name IN (
  'Esquiador + salto vertical 1P',
  'Caida del cajón + salto 3 vallas',
  'Multisaltos pliometricos',
  'Caida del cajón + salto 1 valla',
  'Caida del cajón + salto 2 vallas',
  'Caida del cajón + salto al frente',
  'Caida del cajon + salto en el lugar',
  'Caida del cajón a 1 pie',
  'Caida del cajón y quedo en sentadilla',
  'Salto 1 pie al cajón',
  'Estocadas con salto + oblícuos',
  'Sentadilla con salto',
  'Sentadilla con salto + giro',
  'Burpees + salto al cajón'
)
ORDER BY e.name;

COMMIT;
