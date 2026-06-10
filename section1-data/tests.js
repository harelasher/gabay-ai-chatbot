/**
 * Section 1 Test Suite
 * Tests scraping quality, ingest correctness, and vector search accuracy.
 * Run: node tests.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const OpenAI = require('openai');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`  ✅ PASS  ${name}`);
  passed++;
}

function fail(name, reason) {
  console.log(`  ❌ FAIL  ${name}`);
  console.log(`         → ${reason}`);
  failed++;
}

function assert(condition, name, reason) {
  condition ? pass(name) : fail(name, reason);
}

// ─────────────────────────────────────────────────────────────
// SUITE 1 — Scraped JSON file checks (no DB needed)
// ─────────────────────────────────────────────────────────────
async function suiteScrapedFiles() {
  console.log('\n── Suite 1: Scraped JSON files ─────────────────────────');

  // 1.1 Both JSON files exist
  const gabayExists = fs.existsSync(path.join(__dirname, 'scraped_gabay.json'));
  const defsExists  = fs.existsSync(path.join(__dirname, 'scraped_definitions.json'));
  assert(gabayExists,  '1.1 scraped_gabay.json exists');
  assert(defsExists,   '1.2 scraped_definitions.json exists');
  if (!gabayExists || !defsExists) return;

  const gabay = JSON.parse(fs.readFileSync(path.join(__dirname, 'scraped_gabay.json'), 'utf8'));
  const defs  = JSON.parse(fs.readFileSync(path.join(__dirname, 'scraped_definitions.json'), 'utf8'));

  // 1.3 Company pages: Hebrew only — no EN or FR
  const langs = new Set(gabay.map(p => p.lang));
  const nonHe = [...langs].filter(l => l !== 'he');
  assert(nonHe.length === 0,
    '1.3 All company pages are Hebrew (no EN or FR)', `Non-Hebrew langs found: ${nonHe.join(', ')}`);

  // 1.4 Hebrew company pages scraped (up to 5 — contact page may redirect)
  assert(gabay.length >= 4 && gabay.length <= 5,
    `1.4 4–5 Hebrew company pages scraped`, `Got ${gabay.length}`);

  // 1.5 No company page is too short
  const shortPages = gabay.filter(p => p.text.length < 200);
  assert(shortPages.length === 0,
    '1.5 All company pages have ≥200 chars',
    `Short pages: ${shortPages.map(p => p.url).join(', ')}`);

  // 1.6 Required metadata fields on every company entry
  const missingMeta = gabay.filter(p => !p.url || !p.lang || !p.title || !p.source_type || !p.text);
  assert(missingMeta.length === 0,
    '1.6 All company entries have url/lang/title/source_type/text',
    `${missingMeta.length} entries missing fields`);

  // 1.7 Definitions: at least 150 entries total
  assert(defs.length >= 150,
    `1.7 ≥150 definition entries scraped`, `Got ${defs.length}`);

  // 1.8 All 4 source_types present in definitions
  const defTypes = new Set(defs.map(d => d.source_type));
  const expectedTypes = ['legal', 'investor', 'association', 'media'];
  const missingTypes = expectedTypes.filter(t => !defTypes.has(t));
  assert(missingTypes.length === 0,
    '1.8 All 4 definition source_types present (legal/investor/association/media)',
    `Missing: ${missingTypes.join(', ')}`);

  // 1.9 No definition chunk spans multiple distinct terms (each has its own `term` field or is an article)
  const defsMissingTerm = defs.filter(d => d.source_type !== 'media' && !d.term);
  assert(defsMissingTerm.length === 0,
    '1.9 All non-media definition entries have a term field',
    `${defsMissingTerm.length} entries missing term`);

  // 1.10 Key Hebrew real estate terms are present in definitions
  const allText = defs.map(d => d.text).join(' ');
  const requiredTerms = ['פינוי בינוי', 'תמ"א 38', 'טאבו', 'היטל השבחה'];
  const missingTerms = requiredTerms.filter(t => !allText.includes(t));
  assert(missingTerms.length === 0,
    '1.10 Key terms in scraped definitions (פינוי בינוי, תמ"א 38, טאבו, היטל השבחה)',
    `Missing: ${missingTerms.join(', ')}`);
}

// ─────────────────────────────────────────────────────────────
// SUITE 2 — Database schema and metadata
// ─────────────────────────────────────────────────────────────
async function suiteDatabase() {
  console.log('\n── Suite 2: Database schema & metadata ─────────────────');

  // 2.1 Total chunk count ≥ 200
  const { rows: [{ n }] } = await pool.query('SELECT COUNT(*) AS n FROM chunks');
  const total = parseInt(n, 10);
  assert(total >= 200,
    `2.1 Total chunks ≥ 200 (spec gate)`, `Got ${total}`);

  // 2.2 All required source_types represented in DB
  const { rows: typeRows } = await pool.query(
    'SELECT DISTINCT source_type FROM chunks ORDER BY source_type'
  );
  const types = typeRows.map(r => r.source_type);
  const requiredTypes = ['company', 'legal', 'investor', 'association'];
  const missing = requiredTypes.filter(t => !types.includes(t));
  assert(missing.length === 0,
    '2.2 All required source_types in DB (company/legal/investor/association)',
    `Missing: ${missing.join(', ')}`);

  // 2.3 All chunks are Hebrew — no EN or FR
  const { rows: langRows } = await pool.query('SELECT DISTINCT lang FROM chunks');
  const langs = new Set(langRows.map(r => r.lang));
  const nonHeLangs = [...langs].filter(l => l !== 'he');
  assert(nonHeLangs.length === 0,
    '2.3 All chunks in DB are Hebrew (no EN or FR)', `Non-Hebrew langs: ${nonHeLangs.join(', ')}`);

  // 2.4 No NULL embeddings
  const { rows: [{ nullCount }] } = await pool.query(
    'SELECT COUNT(*) AS "nullCount" FROM chunks WHERE embedding IS NULL'
  );
  assert(parseInt(nullCount, 10) === 0,
    '2.4 No NULL embeddings', `${nullCount} chunks missing embeddings`);

  // 2.5 No NULL source_url
  const { rows: [{ noUrl }] } = await pool.query(
    'SELECT COUNT(*) AS "noUrl" FROM chunks WHERE source_url IS NULL OR source_url = \'\'');
  assert(parseInt(noUrl, 10) === 0,
    '2.5 All chunks have source_url', `${noUrl} chunks missing source_url`);

  // 2.6 Company chunks reference gabaygroup.com
  const { rows: [{ gabayCount }] } = await pool.query(
    "SELECT COUNT(*) AS \"gabayCount\" FROM chunks WHERE source_type = 'company' AND source_url LIKE '%gabaygroup.com%'"
  );
  assert(parseInt(gabayCount, 10) > 0,
    '2.6 Company chunks reference gabaygroup.com');

  // 2.7 Embedding dimension sanity (text-embedding-3-small = 1536 floats)
  // We check by verifying the stored vector literal length is consistent
  const { rows: dimRows } = await pool.query(
    "SELECT LENGTH(embedding::text) AS len FROM chunks WHERE embedding IS NOT NULL LIMIT 1"
  );
  if (dimRows.length > 0) {
    // A 1536-dim float vector serialized to text is thousands of chars
    assert(dimRows[0].len > 5000,
      '2.7 Embedding vector appears to be 1536-dimensional',
      `Serialized length was only ${dimRows[0].len} chars`);
  }
}

// ─────────────────────────────────────────────────────────────
// SUITE 3 — Vector similarity search quality
// ─────────────────────────────────────────────────────────────
async function embed(text) {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float',
  });
  return `[${res.data[0].embedding.join(',')}]`;
}

async function searchTop5(query) {
  const vec = await embed(query);
  const { rows } = await pool.query(
    `SELECT content, source_url, source_type, title, lang
     FROM chunks
     ORDER BY embedding <=> $1::vector
     LIMIT 5`,
    [vec]
  );
  return rows;
}

async function suiteVectorSearch() {
  console.log('\n── Suite 3: Vector similarity search quality ───────────');

  // 3.1 Query about Gabay Group returns company chunks
  const gabayResults = await searchTop5('What projects does Gabay Group have?');
  const hasCompany = gabayResults.some(r => r.source_type === 'company');
  assert(hasCompany,
    '3.1 "Gabay Group projects" → returns ≥1 company chunk',
    `Top 5 types: ${gabayResults.map(r => r.source_type).join(', ')}`);

  // 3.2 Top result for Gabay query references gabaygroup.com
  const topUrl = gabayResults[0]?.source_url || '';
  assert(topUrl.includes('gabaygroup.com'),
    '3.2 Top result for Gabay query from gabaygroup.com',
    `Top URL: ${topUrl}`);

  // 3.3 Hebrew term query returns Hebrew chunks
  const pinuiResults = await searchTop5('מה זה פינוי בינוי?');
  const hebrewResult = pinuiResults.some(r => r.lang === 'he');
  assert(hebrewResult,
    '3.3 Hebrew query "פינוי בינוי" → returns Hebrew chunks');

  // 3.4 פינוי בינוי query returns relevant content
  const pinuiText = pinuiResults.map(r => r.content).join(' ');
  const hasPinui = pinuiText.includes('פינוי') || pinuiText.includes('בינוי');
  assert(hasPinui,
    '3.4 פינוי בינוי query → content contains the term');

  // 3.5 Legal term query returns legal or association source
  const tabuResults = await searchTop5('מהו טאבו ורישום מקרקעין?');
  const hasDefinitionSource = tabuResults.some(r =>
    ['legal', 'association', 'investor'].includes(r.source_type)
  );
  assert(hasDefinitionSource,
    '3.5 Legal term query → returns definition source chunk',
    `Top 5 types: ${tabuResults.map(r => r.source_type).join(', ')}`);

  // 3.6 Contact query returns company chunk
  const contactResults = await searchTop5('How do I contact Gabay Group?');
  const contactHasCompany = contactResults.some(r => r.source_type === 'company');
  assert(contactHasCompany,
    '3.6 Contact query → returns company chunk');

  // 3.7 Urban renewal query returns Hebrew content (replaced multilingual test)
  const urbanResults = await searchTop5('מה תהליך ההתחדשות העירונית?');
  const hasHebrew = urbanResults.some(r => r.lang === 'he');
  assert(hasHebrew,
    '3.7 Urban renewal query → returns Hebrew content');

  // 3.8 TAMA 38 query returns definition content
  const tamaResults = await searchTop5('מה ההבדל בין תמא 38 לפינוי בינוי?');
  const tamaText = tamaResults.map(r => r.content).join(' ');
  const hasTama = tamaText.includes('38') || tamaText.includes('תמ"א') || tamaText.includes('תמא');
  assert(hasTama,
    '3.8 TAMA 38 query → content contains "38" or "תמ"א"');

  // 3.9 Same query run twice returns identical results (determinism)
  const run1 = await searchTop5('urban renewal Israel');
  const run2 = await searchTop5('urban renewal Israel');
  const sameIds = run1.map(r => r.source_url).join(',') === run2.map(r => r.source_url).join(',');
  assert(sameIds, '3.9 Identical query returns identical results (vector search is deterministic)');

  // 3.10 Completely off-topic query does NOT return company chunks at top
  const offTopicResults = await searchTop5('recipe for chocolate cake');
  // The top result should NOT be a company chunk (it's off-topic)
  const topIsCompany = offTopicResults[0]?.source_type === 'company';
  assert(!topIsCompany,
    '3.10 Off-topic query (chocolate cake) does not rank company content first',
    `Top result was type: ${offTopicResults[0]?.source_type}`);
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Section 1 Test Suite ===');
  console.log('Running 30 tests across 3 suites...\n');

  try {
    await suiteScrapedFiles();
    await suiteDatabase();
    await suiteVectorSearch();
  } catch (err) {
    console.error('\nUnexpected test runner error:', err.message);
    failed++;
  } finally {
    await pool.end();
  }

  const total = passed + failed;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed}/${total} passed  |  ${failed} failed`);
  if (failed === 0) {
    console.log('✅ All tests passed — Section 1 is complete!');
  } else {
    console.log('❌ Some tests failed — review output above.');
    process.exit(1);
  }
}

main();
