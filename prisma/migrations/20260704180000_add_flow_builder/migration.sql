CREATE TABLE "bot_flows" (
  "id"               SERIAL PRIMARY KEY,
  "name"             TEXT NOT NULL,
  "description"      TEXT,
  "trigger_keywords" TEXT NOT NULL DEFAULT '',
  "is_active"        BOOLEAN NOT NULL DEFAULT true,
  "sort_order"       INT NOT NULL DEFAULT 0,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "bot_flow_steps" (
  "id"         SERIAL PRIMARY KEY,
  "flow_id"    INT NOT NULL REFERENCES "bot_flows"("id") ON DELETE CASCADE,
  "step_key"   TEXT NOT NULL,
  "message"    TEXT NOT NULL,
  "input_type" TEXT NOT NULL DEFAULT 'button',
  "is_entry"   BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "bot_flow_steps_flow_id_step_key_key" UNIQUE ("flow_id", "step_key")
);

CREATE TABLE "bot_flow_options" (
  "id"            SERIAL PRIMARY KEY,
  "step_id"       INT NOT NULL REFERENCES "bot_flow_steps"("id") ON DELETE CASCADE,
  "label"         TEXT NOT NULL,
  "value"         TEXT NOT NULL,
  "description"   TEXT,
  "next_step_key" TEXT,
  "data_source"   TEXT NOT NULL DEFAULT 'static',
  "sort_order"    INT NOT NULL DEFAULT 0
);

CREATE INDEX "bot_flows_is_active_idx"      ON "bot_flows"("is_active");
CREATE INDEX "bot_flow_steps_flow_id_idx"   ON "bot_flow_steps"("flow_id");
CREATE INDEX "bot_flow_options_step_id_idx" ON "bot_flow_options"("step_id");
