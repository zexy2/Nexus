ALTER TABLE "docs"
  ADD COLUMN IF NOT EXISTS "is_ai_generated" integer DEFAULT 0 NOT NULL;
