-- Manual order of customers (companies) in Round Robin and reports. Null = listed after numbered companies.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS display_order integer;
