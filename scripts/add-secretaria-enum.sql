-- Añade el valor 'SECRETARIA' al enum user_role_enum en PostgreSQL.
-- Ejecutar contra la base de datos del backend (local y/o Railway) si aparece:
--   QueryFailedError: invalid input value for enum user_role_enum: "SECRETARIA"
--
-- Cómo ejecutar:
--   psql $DATABASE_URL -f scripts/add-secretaria-enum.sql
--   o pegar este contenido en pgAdmin / DBeaver / Railway Query.

ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'SECRETARIA';
