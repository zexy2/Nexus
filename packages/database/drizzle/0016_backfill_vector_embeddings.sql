-- Embedding search now ranks in SQL on the pgvector "embedding" column
-- (ORDER BY embedding <=> $q LIMIT n, served by vectors_embedding_hnsw_idx
-- from 0007). Rows written before the native column existed only carry
-- "embedding_json"; copy those into "embedding" so they stay searchable.
-- Additive: no row is deleted and embedding_json is left untouched. Rows
-- whose JSON is not a 1536-dimension numeric array are skipped.
UPDATE "vectors"
SET "embedding" = ("embedding_json"::text)::vector
WHERE "embedding" IS NULL
  AND "embedding_json" IS NOT NULL
  AND jsonb_typeof("embedding_json") = 'array'
  AND jsonb_array_length("embedding_json") = 1536
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("embedding_json") AS element
    WHERE jsonb_typeof(element) <> 'number'
  );
