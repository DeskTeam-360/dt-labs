-- AI settings: multi-row presets, only is_active=true row is used at runtime
DROP TABLE IF EXISTS ai_settings;

CREATE TABLE ai_settings (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name            varchar(128) NOT NULL DEFAULT 'Default',
  is_active       boolean      NOT NULL DEFAULT false,
  provider        varchar(32)  NOT NULL DEFAULT 'openai',
  openai_api_key  text,
  openai_base_url text,
  openai_model    varchar(128),
  codex_api_key   text,
  codex_base_url  text,
  codex_model     varchar(128),
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  updated_by      uuid
);

-- Only one active row at a time (partial unique index)
CREATE UNIQUE INDEX ai_settings_one_active ON ai_settings (is_active) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON ai_settings TO dtlabs;
