-- Run this once against your PostgreSQL database before running ingest.js
-- Requires pgvector extension: https://github.com/pgvector/pgvector

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS chunks (
  id          SERIAL PRIMARY KEY,
  content     TEXT NOT NULL,
  embedding   vector(1536),
  source_url  TEXT,
  source_type TEXT,
  lang        TEXT,
  title       TEXT,
  chunk_index INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- IVFFlat index for approximate nearest-neighbour cosine search
-- Adjust `lists` based on total row count: sqrt(rows) is a good default.
-- With ~200-500 chunks, lists=20 is fine; for 10k+ rows use lists=100.
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 20);

-- ─── Lead capture ─────────────────────────────────────────────────────────────
-- Populated by /api/whatsapp — one row per unique phone number.

CREATE TABLE IF NOT EXISTS leads (
  id         SERIAL PRIMARY KEY,
  phone      TEXT        NOT NULL UNIQUE,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen  TIMESTAMPTZ DEFAULT NOW(),
  msg_count  INTEGER     DEFAULT 1
);

-- ─── Query analytics ──────────────────────────────────────────────────────────
-- One row per successful RAG call from web or WhatsApp.

CREATE TABLE IF NOT EXISTS queries (
  id          SERIAL PRIMARY KEY,
  channel     TEXT        NOT NULL CHECK (channel IN ('web', 'whatsapp')),
  question    TEXT        NOT NULL,
  answer_len  INTEGER,
  sources     TEXT[],
  duration_ms INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
