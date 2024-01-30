CREATE TABLE IF NOT EXISTS public."company"
(
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name character varying(50) COLLATE pg_catalog."default" NOT NULL,
    image character varying(400) COLLATE pg_catalog."default",
    primary_color character varying(50),
    secondary_color character varying(50),
    created_at timestamp with time zone default current_timestamp,
    updated_at timestamp with time zone default current_timestamp,
    deleted_at date,
    is_active boolean DEFAULT true,
    is_delete boolean DEFAULT false,
    CONSTRAINT company_pkey PRIMARY KEY (id),
    CONSTRAINT company_name UNIQUE (name)
);

CREATE OR REPLACE FUNCTION set_updatedAt() RETURNS trigger AS
$set_updatedAt$
BEGIN
    IF NEW."updated_at" = OLD."updated_at" THEN
        NEW."updated_at" = NOW();
    END IF;
    RETURN NEW;
END;
$set_updatedAt$ LANGUAGE plpgsql;

CREATE TRIGGER update_company_modify
BEFORE UPDATE ON "company"
FOR EACH ROW EXECUTE PROCEDURE set_updatedAt();