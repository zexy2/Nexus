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
-- 4. Approximate-nearest-neighbour indexes for fast similarity search
--
-- Semantic RAG (cosine distance, the `<=>` operator) works WITHOUT an index
-- via sequential scan — fine for small workspaces. Add an index for scale.
--
-- HNSW is recommended: unlike IVFFlat it needs no training data and can be
-- created on an empty table, so it is safe to run now. The query uses cosine
-- distance, so use the vector_cosine_ops opclass.
-- ==========================================

CREATE INDEX IF NOT EXISTS vectors_embedding_hnsw_idx
  ON vectors USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS docs_embedding_hnsw_idx
  ON docs USING hnsw (embedding vector_cosine_ops);

-- Alternative (older pgvector without HNSW): IVFFlat. Create only AFTER the
-- table has data — it requires ~(lists * 39) rows to train effectively.
-- CREATE INDEX IF NOT EXISTS vectors_embedding_idx
--   ON vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ==========================================
-- 5. Verify changes
-- ==========================================
-- Run these to verify:
-- \d docs
-- \d vectors
-- SELECT COUNT(*) FROM docs WHERE embedding IS NOT NULL;
