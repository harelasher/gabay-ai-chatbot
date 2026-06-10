/**
 * fix-lang.js
 * Re-evaluates the `lang` column for every chunk in the DB using actual
 * character-ratio detection instead of the URL-path heuristic used during
 * the initial ingest.  Also removes any non-Hebrew chunks (EN/FR company
 * pages) since the project is now Hebrew-only.
 *
 * Run: node fix-lang.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Hebrew Unicode blocks: basic Hebrew + extended (niqqud, cantillation, FB block)
function detectLang(text) {
  const heCount    = (text.match(/[֐-׿יִ-ﭏ]/g) || []).length;
  const alphaCount = (text.match(/[a-zA-Z֐-׿יִ-ﭏ]/g) || []).length;
  if (alphaCount === 0) return 'he';
  return heCount / alphaCount > 0.25 ? 'he' : 'en';
}

async function main() {
  console.log('=== Language Fix Script ===\n');

  const { rows } = await pool.query(
    'SELECT id, lang, source_type, content FROM chunks ORDER BY id'
  );
  console.log(`Scanning ${rows.length} chunks...\n`);

  let corrected = 0;
  let removed   = 0;

  for (const row of rows) {
    const detected = detectLang(row.content);

    // Delete any genuinely non-Hebrew chunk — project is Hebrew-only
    if (detected !== 'he') {
      await pool.query('DELETE FROM chunks WHERE id = $1', [row.id]);
      console.log(`  DELETED  id=${row.id}  (was lang=${row.lang}, detected=${detected}) — non-Hebrew company chunk`);
      removed++;
      continue;
    }

    // Correct mislabelled language on any remaining chunk
    if (detected !== row.lang) {
      await pool.query('UPDATE chunks SET lang = $1 WHERE id = $2', [detected, row.id]);
      console.log(`  FIXED    id=${row.id}  ${row.lang} → ${detected}  "${row.content.slice(0, 60).replace(/\s+/g, ' ')}..."`);
      corrected++;
    }
  }

  console.log(`\n─────────────────────────────────────`);
  console.log(`Language corrections: ${corrected}`);
  console.log(`Non-Hebrew chunks removed: ${removed}`);

  // Final breakdown
  const { rows: summary } = await pool.query(
    'SELECT lang, COUNT(*) AS n FROM chunks GROUP BY lang ORDER BY n DESC'
  );
  console.log('\nFinal language breakdown:');
  summary.forEach(r => console.log(`  ${(r.lang || 'unknown').padEnd(5)} ${r.n}`));

  const { rows: [{ total }] } = await pool.query('SELECT COUNT(*) AS total FROM chunks');
  console.log(`\nTotal chunks remaining: ${total}`);

  await pool.end();
  console.log('\n=== Fix complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
