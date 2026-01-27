-- Nexus Database Migration - pgvector Schema Update
-- Run this after updating Drizzle schema to sync database
-- Date: 2026-01-18

-- ==========================================
-- 1. Enable pgvector extension (if not exists)
-- ==========================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ==========================================
-- 2. Add embedding column to docs table
-- ==========================================
ALTER TABLE docs 
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- ==========================================
-- 3. Add embedding column to vectors table
-- ==========================================
ALTER TABLE vectors 
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- ==========================================
-- 4. Create IVFFlat indexes for fast similarity search
-- Note: Run these AFTER you have some data in the tables
-- IVFFlat requires at least (lists * 39) rows to work effectively
-- ==========================================

-- Index for docs table (when you have 100+ docs)
-- CREATE INDEX IF NOT EXISTS docs_embedding_idx 
--   ON docs USING ivfflat (embedding vector_cosine_ops) 
--   WITH (lists = 100);

-- Index for vectors table (when you have 1000+ vectors)
-- CREATE INDEX IF NOT EXISTS vectors_embedding_idx 
--   ON vectors USING ivfflat (embedding vector_cosine_ops) 
--   WITH (lists = 100);

-- ==========================================
-- 5. Verify changes
-- ==========================================
-- Run these to verify:
-- \d docs
-- \d vectors
-- SELECT COUNT(*) FROM docs WHERE embedding IS NOT NULL;
