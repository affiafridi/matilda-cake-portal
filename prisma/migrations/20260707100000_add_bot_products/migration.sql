CREATE TABLE IF NOT EXISTS "bot_products" (
  "id"         SERIAL PRIMARY KEY,
  "wc_id"      INTEGER NOT NULL,
  "category_id" INTEGER NOT NULL,
  "name"       TEXT NOT NULL,
  "price"      TEXT NOT NULL DEFAULT '',
  "image"      TEXT NOT NULL DEFAULT '',
  "permalink"  TEXT NOT NULL DEFAULT '',
  "enabled"    BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("wc_id", "category_id")
);

CREATE INDEX IF NOT EXISTS "bot_products_category_id_idx" ON "bot_products" ("category_id");
CREATE INDEX IF NOT EXISTS "bot_products_enabled_idx" ON "bot_products" ("category_id", "enabled");
