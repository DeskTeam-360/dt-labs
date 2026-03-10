-- Add domain_list to companies: emails with these domains belong to this company
-- E.g. ['acme.com','acme.co.id'] - user john@acme.com belongs to company with domain_list containing acme.com
ALTER TABLE companies ADD COLUMN IF NOT EXISTS domain_list TEXT[] DEFAULT '{}';
COMMENT ON COLUMN companies.domain_list IS 'Domains that belong to this company. E.g. acme.com means user@acme.com is part of this company';
