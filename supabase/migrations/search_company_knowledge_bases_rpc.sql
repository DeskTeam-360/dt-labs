-- RPC: semantic search over company_knowledge_bases by embedding (cosine similarity)
-- Returns id, content, and similarity (1 - cosine_distance) for top match_count rows.

CREATE OR REPLACE FUNCTION search_company_knowledge_bases(
  p_company_id UUID,
  p_query_embedding vector(1536),
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ckb.id,
    ckb.content,
    1 - (ckb.embedding <=> p_query_embedding) AS similarity
  FROM company_knowledge_bases ckb
  WHERE ckb.company_id = p_company_id
    AND ckb.embedding IS NOT NULL
  ORDER BY ckb.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(COALESCE(p_match_count, 5), 20));
END;
$$;

-- Allow authenticated to execute
GRANT EXECUTE ON FUNCTION search_company_knowledge_bases(UUID, vector(1536), INT) TO authenticated;
GRANT EXECUTE ON FUNCTION search_company_knowledge_bases(UUID, vector(1536), INT) TO service_role;
