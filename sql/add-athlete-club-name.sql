-- Club de origen del atleta (texto libre). Nullable: si está vacío, la UI usa el nombre del centro.
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS club_name VARCHAR(200) NULL;

COMMENT ON COLUMN "user".club_name IS 'Club deportivo de origen del atleta; default implícito = nombre del centro (sports_club)';
