require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('=== Gabay Vector DB Verification ===\n');

  // Total chunk count
  const { rows: countRows } = await pool.query('SELECT COUNT(*) AS n FROM chunks');
  const total = parseInt(countRows[0].n, 10);
  console.log(`Total chunks: ${total}`);
  if (total < 200) {
    console.warn(`⚠  WARNING — expected 200+ chunks, got ${total}.`);
    console.warn('   Re-run scraper.js then ingest.js if sources returned less content than expected.\n');
  } else {
    console.log(`✅ Chunk count OK (${total} ≥ 200)\n`);
  }

  // Breakdown by source_type
  const { rows: byType } = await pool.query(
    'SELECT source_type, COUNT(*) AS n FROM chunks GROUP BY source_type ORDER BY n DESC'
  );
  console.log('By source_type:');
  for (const r of byType) {
    console.log(`  ${r.source_type.padEnd(12)} ${r.n}`);
  }
  console.log();

  // Breakdown by language
  const { rows: byLang } = await pool.query(
    'SELECT lang, COUNT(*) AS n FROM chunks GROUP BY lang ORDER BY n DESC'
  );
  console.log('By language:');
  for (const r of byLang) {
    console.log(`  ${(r.lang || 'unknown').padEnd(6)} ${r.n}`);
  }
  console.log();

  // Check embeddings are populated
  const { rows: nullCheck } = await pool.query(
    'SELECT COUNT(*) AS n FROM chunks WHERE embedding IS NULL'
  );
  const nullEmbeddings = parseInt(nullCheck[0].n, 10);
  if (nullEmbeddings > 0) {
    console.warn(`⚠  ${nullEmbeddings} chunks have NULL embeddings — re-run ingest.js.\n`);
  } else {
    console.log(`✅ All chunks have embeddings\n`);
  }

  // 5 random sample chunks
  console.log('--- 5 Random Sample Chunks ---');
  const { rows: samples } = await pool.query(
    `SELECT id, source_type, lang, title,
            LEFT(content, 250) AS preview,
            source_url
     FROM chunks
     ORDER BY RANDOM()
     LIMIT 5`
  );
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    console.log(`\n[${i + 1}] id=${s.id}  type=${s.source_type}  lang=${s.lang}`);
    console.log(`    Title:   ${s.title}`);
    console.log(`    URL:     ${s.source_url}`);
    console.log(`    Preview: ${s.preview}...`);
  }
  console.log();

  // Quick similarity sanity-check using the first chunk's own embedding
  console.log('--- Similarity sanity check ---');
  const { rows: first } = await pool.query(
    'SELECT id, embedding FROM chunks WHERE embedding IS NOT NULL LIMIT 1'
  );
  if (first.length > 0) {
    const { rows: similar } = await pool.query(
      `SELECT id, source_type, LEFT(content, 80) AS preview
       FROM chunks
       ORDER BY embedding <=> $1::vector
       LIMIT 3`,
      [first[0].embedding]
    );
    console.log('Top 3 chunks nearest to chunk #' + first[0].id + ':');
    for (const r of similar) {
      console.log(`  id=${r.id} (${r.source_type}): ${r.preview}...`);
    }
    console.log();
    console.log('✅ Vector similarity search works');
  } else {
    console.warn('⚠  No embeddings found — cannot run similarity check.');
  }

  await pool.end();
  console.log('\n=== Verification complete ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
