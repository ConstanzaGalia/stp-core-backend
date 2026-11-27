-- Rol comercial de STP. Hay que correrlo antes de asignar el rol a una persona.
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'STP_SALES';
