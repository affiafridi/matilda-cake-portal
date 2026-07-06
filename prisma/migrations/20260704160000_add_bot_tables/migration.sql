-- bot_shop_config: single row (id=1) for contact info and team numbers
CREATE TABLE "bot_shop_config" (
  "id"            SERIAL PRIMARY KEY,
  "phone"         TEXT NOT NULL DEFAULT '',
  "email"         TEXT NOT NULL DEFAULT '',
  "website"       TEXT NOT NULL DEFAULT '',
  "welcome_image" TEXT NOT NULL DEFAULT '',
  "team_numbers"  TEXT NOT NULL DEFAULT '',
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the single config row
INSERT INTO "bot_shop_config" ("id") VALUES (1) ON CONFLICT DO NOTHING;

-- bot_trigger_keywords: one row per keyword
CREATE TABLE "bot_trigger_keywords" (
  "id"         SERIAL PRIMARY KEY,
  "word"       TEXT NOT NULL,
  "type"       TEXT NOT NULL DEFAULT 'handoff',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "bot_trigger_keywords_word_key" UNIQUE ("word")
);

-- Default handoff keywords
INSERT INTO "bot_trigger_keywords" ("word", "type") VALUES
  ('human',    'handoff'),
  ('agent',    'handoff'),
  ('talk',     'handoff'),
  ('operator', 'handoff'),
  ('مساعدة',   'handoff'),
  ('وكيل',     'handoff')
ON CONFLICT ("word") DO NOTHING;

-- bot_replies: one row per reply key
CREATE TABLE "bot_replies" (
  "id"         SERIAL PRIMARY KEY,
  "key"        TEXT NOT NULL,
  "body_en"    TEXT NOT NULL,
  "body_ar"    TEXT,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "bot_replies_key_key" UNIQUE ("key")
);

-- Default reply messages
INSERT INTO "bot_replies" ("key", "body_en", "body_ar") VALUES
  ('fallback',
   'I didn''t quite get that 😊' || chr(10) || chr(10) || 'Try:' || chr(10) || '• Type *menu* to see all our categories' || chr(10) || '• Or tell me what you''re looking for',
   'ما فهمت قصدك 😊' || chr(10) || chr(10) || 'جرب:' || chr(10) || '• اكتب *menu* تشوف كل فئاتنا' || chr(10) || '• أو قولي شو تدور'),
  ('handoff',
   'Sure! 😊 I''m notifying our team right now.' || chr(10) || chr(10) || 'Someone will reach out to you shortly.',
   'حاضر! 😊 رح أوصلك بفريقنا هلق.' || chr(10) || chr(10) || 'بيتواصلون معك بأقرب وقت.'),
  ('error',
   'Something went wrong, please try again! 🙏',
   'صار خطأ تقني، حاول مرة ثانية! 🙏'),
  ('non_text',
   'Please send a text message 😊 e.g. *menu*',
   'أرسل رسالة نصية بس 😊 مثل: *menu*')
ON CONFLICT ("key") DO NOTHING;
