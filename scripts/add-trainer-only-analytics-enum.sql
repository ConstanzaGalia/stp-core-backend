-- Añade el valor 'TRAINER_ONLY_ANALYTICS' al enum user_role_enum.
-- Ver también: sql/add-club-analytics-trainer.sql (tabla completa).

ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'TRAINER_ONLY_ANALYTICS';
