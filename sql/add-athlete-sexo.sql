-- Sexo biológico del atleta (criterios / reportes). Valores: femenino | masculino.
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS sexo VARCHAR(20) NULL;

COMMENT ON COLUMN "user".sexo IS 'Sexo del atleta: femenino | masculino';
