/**
 * chain.js — RAG chain for Gabay Group chatbot
 *
 * Standalone test:  node chain.js
 * Used by:          server.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const OpenAI   = require('openai');

const pool   = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMBED_MODEL = 'text-embedding-3-small';
const CHAT_MODEL  = 'gpt-4o';
const K           = 5;    // chunks to retrieve
const TEMP        = 0.2;  // factual assistant — keep low

// ─── System prompt (Hebrew-only) ──────────────────────────────────────────────

const SYSTEM_PROMPT = `אתה עוזר מועיל של קבוצת גבאי, חברת פיתוח נדל"ן ישראלית המתמחה בהתחדשות עירונית ופרויקטים של פינוי-בינוי ותמ"א 38.

ענה על שאלות המשתמש תוך שימוש אך ורק בהקשר המסופק להלן.

עדיפות מקורות (מהגבוהה לנמוכה):
1. תוכן מאתר gabaygroup.com — תמיד תעדף זאת לעובדות ספציפיות לחברה
2. הגדרות משפטיות מ-dmlaw.co.il
3. הגדרות רשמיות מ-igud-nadlan.org
4. תוכן למשקיעים מ-dkarka.co.il
5. תוכן כללי מ-nadlancenter.co.il

אם ההקשר אינו מכיל מספיק מידע לתשובה, השב בדיוק:
"אין לי מספיק מידע על כך. אנא פנה לקבוצת גבאי ישירות במייל office@gabaygroup.com או התקשר *8809."

כללים:
- לעולם אל תמציא שמות פרויקטים, כתובות, מחירים, לוחות זמנים או מידע משפטי.
- לעולם אל תיתן ייעוץ משפטי או פיננסי. אם נשאל, אמור: "לשאלות משפטיות הנוגעות לזכויותיך, אני ממליץ להתייעץ עם עורך דין מקרקעין מוסמך."
- ענה תמיד בעברית, ללא קשר לשפת השאלה.
- הגבל תשובות ל-3-4 משפטים אלא אם המשתמש ביקש פירוט נוסף.
- בעת שימוש בהגדרה ממקור חיצוני, ניתן לציין את המקור (למשל "לפי איגוד הנדל"ן הישראלי...").`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function embedQuery(text) {
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: text,
    encoding_format: 'float',
  });
  return `[${res.data[0].embedding.join(',')}]`;
}

async function retrieveChunks(queryVector) {
  const { rows } = await pool.query(
    `SELECT content, source_url, source_type, title
     FROM chunks
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [queryVector, K]
  );
  return rows;
}

function buildUserPrompt(question, chunks) {
  const context = chunks
    .map((c, i) => `[${i + 1}] מקור: ${c.source_url} (${c.source_type})\n${c.content}`)
    .join('\n\n');
  return `הקשר:\n\n${context}\n\n---\nשאלת המשתמש: ${question}`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function queryRAG(question) {
  const queryVec = await embedQuery(question);
  const chunks   = await retrieveChunks(queryVec);

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: TEMP,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: buildUserPrompt(question, chunks) },
    ],
  });

  const answer  = completion.choices[0].message.content;
  const sources = [...new Set(chunks.map(c => c.source_url))];

  return { answer, sources };
}

module.exports = { queryRAG, pool };

// ─── Standalone test ──────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    console.log('=== chain.js standalone test ===\n');
    const question = 'מה זה פינוי בינוי וכיצד קבוצת גבאי מתמחה בכך?';
    console.log('שאלה:', question, '\n');
    try {
      const { answer, sources } = await queryRAG(question);
      console.log('תשובה:\n', answer);
      console.log('\nמקורות:', sources);
    } catch (err) {
      console.error('שגיאה:', err.message);
    } finally {
      await pool.end();
    }
  })();
}
