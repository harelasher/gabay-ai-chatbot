/**
 * chain.js — RAG chain for Gabay Group chatbot
 *
 * Standalone test:  node chain.js
 * Used by:          server.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
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

פרטי קשר מדויקים של קבוצת גבאי (השתמש בפרטים אלו תמיד כשנשאל על יצירת קשר):
- אימייל: office@gabaygroup.com
- טלפון משרד ראשי: 03-5612055
- מכירות: *8809
- פקס: 03-5612456
- כתובת: מגדלי LYFE בניין B, הירקון 5א', בני ברק

ענה על שאלות המשתמש תוך שימוש בהקשר המסופק להלן.

עדיפות מקורות (מהגבוהה לנמוכה):
1. תוכן מאתר gabaygroup.com — תמיד תעדף זאת לעובדות ספציפיות לחברה
2. הגדרות משפטיות מ-dmlaw.co.il
3. מידע על זכויות מ-kolzchut.org.il
4. הגדרות רשמיות מ-igud-nadlan.org
5. תוכן למשקיעים מ-dkarka.co.il
6. תוכן כללי מ-nadlancenter.co.il

כלל מפתח לתשובות כאשר אין מספיק מידע בהקשר:
- לשאלות ספציפיות לקבוצת גבאי (פרויקטים ספציפיים, מחירים, לוחות זמנים) — הפנה ישירות לפרטי הקשר של החברה.
- לשאלות כלליות בנדל"ן ישראלי (תהליכים, זכויות, חוקים, הגדרות) — השתמש בידע הכללי שלך ותן תשובה מועילה.

כללים:
- לעולם אל תמציא שמות פרויקטים, כתובות, מחירים או לוחות זמנים של קבוצת גבאי.
- לשאלות הנוגעות לזכויות, תהליכים משפטיים או פיננסיים בנושא פרויקטים של קבוצת גבאי — הפנה תמיד לקבוצת גבאי ישירות: office@gabaygroup.com או *8809.
- ענה תמיד בעברית, ללא קשר לשפת השאלה.
- הגבל תשובות ל-3-4 משפטים אלא אם המשתמש ביקש פירוט נוסף.
- אל תציין בטקסט התשובה מאיזה אתר לקחת את המידע (לא "לפי כל זכות", לא "לפי איגוד הנדל"ן" וכו'). המקורות מופיעים בנפרד.
- כאשר אתה מפרט ערים או פרויקטים של קבוצת גבאי, הוסף בסוף הצעה לפנות לחברה לפרטים ספציפיים.`;

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

  const answer = completion.choices[0].message.content;

  // When a question is clearly about Gabay Group specifically, only surface
  // gabaygroup.com sources — definition sites appearing alongside company
  // answers adds noise and confusion.
  const isGabaySpecific = /גבאי|gabay/i.test(question);
  const gabayUrls = chunks
    .filter(c => c.source_url.includes('gabaygroup.com'))
    .map(c => c.source_url);
  const allUrls = chunks.map(c => c.source_url);
  const sources = [...new Set(isGabaySpecific && gabayUrls.length > 0 ? gabayUrls : allUrls)];

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
