CREATE TABLE IF NOT EXISTS public."user"
(
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name character varying(50) COLLATE pg_catalog."default" NOT NULL,
    lastname character varying(80) COLLATE pg_catalog."default" NOT NULL,
    email character varying(100) COLLATE pg_catalog."default" NOT NULL,
    password character varying COLLATE pg_catalog."default" NOT NULL,
    phone_number bigint,
    country character varying COLLATE pg_catalog."default",
    city character varying COLLATE pg_catalog."default",
    image_profile character varying COLLATE pg_catalog."default",
    role character varying COLLATE pg_catalog."default",
    active_token character varying COLLATE pg_catalog."default",
    reset_password_token character varying COLLATE pg_catalog."default",
    created_at timestamp with time zone default current_timestamp,
    updated_at timestamp with time zone default current_timestamp,
    deleted_at date,
    is_active boolean DEFAULT false,
    is_delete boolean DEFAULT false,
    CONSTRAINT user_pkey PRIMARY KEY (id),
    CONSTRAINT user_email UNIQUE (email)
)
