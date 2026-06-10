require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EMBED_DELAY_MS = 150;        // stay well under OpenAI rate limits
const MAX_CHARS = 1500;            // ≈ 375–400 tokens for mixed Hebrew/English
const OVERLAP_CHARS = 200;         // ≈ 50 tokens
const MIN_CHARS_SPLIT = 300;       // minimum for text-splitter output (company pages)
const MIN_CHARS_DEF = 80;          // minimum for pre-formed definition chunks (Hebrew ~80 tokens ≈ 80-160 chars)

// ─── Text splitter ────────────────────────────────────────────────────────────
// Implements the RecursiveCharacterTextSplitter algorithm:
// tries to break on paragraphs → newlines → sentences → words.

function chunkText(text, maxChars, overlapChars, minChars) {
  if (text.length <= maxChars) return text.length >= minChars ? [text.trim()] : [];

  const chunks = [];
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  let current = '';

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed.length >= minChars) chunks.push(trimmed);
    // carry overlap into next chunk
    current = trimmed.slice(-overlapChars);
  };

  for (const para of paragraphs) {
    const tentative = current ? `${current}\n\n${para}` : para;

    if (tentative.length <= maxChars) {
      current = tentative;
      continue;
    }

    // Current chunk is full — flush it, then handle the long paragraph
    if (current.length >= minChars) flush();

    // Para itself may be longer than maxChars — split on sentences
    let remaining = para;
    while (remaining.length > maxChars) {
      // Find a sentence break within the window
      const window = remaining.slice(0, maxChars);
      const breakAt =
        Math.max(
          window.lastIndexOf('. '),
          window.lastIndexOf('! '),
          window.lastIndexOf('? '),
          window.lastIndexOf('.\n'),
        ) + 1;

      const splitAt = breakAt > minChars ? breakAt : maxChars;
      const piece = remaining.slice(0, splitAt).trim();
      if (piece.length >= minChars) chunks.push(piece);
      remaining = remaining.slice(splitAt - overlapChars).trim();
    }

    current = current ? `${current}\n\n${remaining}` : remaining;
    if (current.length > maxChars) flush();
  }

  if (current.trim().length >= minChars) chunks.push(current.trim());
  return chunks;
}

// ─── Embedding ────────────────────────────────────────────────────────────────

async function embed(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float',
  });
  return response.data[0].embedding;
}

// ─── DB insert ────────────────────────────────────────────────────────────────

async function insertChunk(chunk, embedding) {
  const vectorLiteral = `[${embedding.join(',')}]`;
  await pool.query(
    `INSERT INTO chunks (content, embedding, source_url, source_type, lang, title, chunk_index)
     VALUES ($1, $2::vector, $3, $4, $5, $6, $7)`,
    [
      chunk.content,
      vectorLiteral,
      chunk.source_url,
      chunk.source_type,
      chunk.lang,
      chunk.title,
      chunk.chunk_index,
    ]
  );
}

// ─── Chunk builders ───────────────────────────────────────────────────────────

function buildGabayChunks(pages) {
  const result = [];
  for (const page of pages) {
    const pieces = chunkText(page.text, MAX_CHARS, OVERLAP_CHARS, MIN_CHARS_SPLIT);
    pieces.forEach((content, i) => {
      result.push({
        content,
        source_url: page.url,
        source_type: page.source_type,
        lang: page.lang,
        title: page.title,
        chunk_index: i,
      });
    });
  }
  return result;
}

function buildDefinitionChunks(definitions) {
  // Each definition entry is one chunk — do NOT split across definitions.
  return definitions
    .filter((d) => d.text && d.text.trim().length >= MIN_CHARS_DEF)
    .map((d, i) => ({
      content: d.text.trim(),
      source_url: d.url,
      source_type: d.source_type,
      lang: d.lang,
      title: d.term || d.title,
      chunk_index: i,
    }));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Gabay Ingest ===\n');

  // Load scraped data
  const gabayRaw = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'scraped_gabay.json'), 'utf8')
  );
  const defsRaw = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'scraped_definitions.json'), 'utf8')
  );
  console.log(`Loaded ${gabayRaw.length} company pages, ${defsRaw.length} definition entries.\n`);

  // Build chunk lists
  console.log('Chunking company pages...');
  const gabayChunks = buildGabayChunks(gabayRaw);
  console.log(`→ ${gabayChunks.length} company chunks\n`);

  console.log('Processing definition entries...');
  const defChunks = buildDefinitionChunks(defsRaw);
  console.log(`→ ${defChunks.length} definition chunks\n`);

  const allChunks = [...gabayChunks, ...defChunks];

  // Deduplicate by content (don't embed the same text twice)
  const seen = new Set();
  const uniqueChunks = allChunks.filter((c) => {
    const key = c.content.slice(0, 120);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`Total unique chunks to embed: ${uniqueChunks.length}\n`);

  // Clear previous data (safe to re-run)
  console.log('Clearing existing chunks from DB...');
  await pool.query('DELETE FROM chunks');

  // Embed and insert
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < uniqueChunks.length; i++) {
    const chunk = uniqueChunks[i];
    process.stdout.write(`\r  Embedding ${i + 1}/${uniqueChunks.length}  (errors: ${errors})`);

    try {
      const embedding = await embed(chunk.content);
      await insertChunk(chunk, embedding);
      inserted++;
    } catch (err) {
      errors++;
      console.error(`\n  Error on chunk ${i} (${chunk.source_type}): ${err.message}`);
    }

    await sleep(EMBED_DELAY_MS);
  }

  console.log(`\n\n=== Ingest complete ===`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`\nRun "node verify.js" to confirm the DB is ready.`);

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
