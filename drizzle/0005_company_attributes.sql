CREATE TABLE IF NOT EXISTS "company_attributes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "meta_key" varchar(255) NOT NULL,
  "meta_value" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "company_attributes_company_id_meta_key_key" UNIQUE("company_id","meta_key")
);
