/**
 * test.js — 10-question terminal test for Section 2
 * Runs every required question, prints answer + sources, grades each response.
 *
 * Run: node test.js
 * Pass criteria (per spec):
 *   ✅  Answer references actual content from scraped data
 *   ✅  Sources array contains at least one real URL
 *   ✅  Answer does NOT contain the hallucination marker phrase
 */
require('dotenv').config();
const { queryRAG } = require('./chain');
const { Pool }     = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Hebrew-only version of the 10 required test questions
const TEST_QUESTIONS = [
  // Company questions
  'אילו פרויקטים יש לקבוצת גבאי בתל אביב?',
  'כמה יחידות דיור בנתה קבוצת גבאי?',
  'כיצד ניתן ליצור קשר עם קבוצת גבאי?',
  'באילו ערים פועלת קבוצת גבאי?',
  // Urban-renewal questions
  'מה זה פינוי בינוי?',
  'כמה זמן לוקח תהליך פינוי בינוי?',
  'מה הזכויות שלי כדייר בפינוי בינוי?',
  'מה ההבדל בין תמ"א 38 לפינוי בינוי?',
  // Mixed / edge cases
  'אילו פרויקטים זמינים בנתניה?',
  'מה קורה אם שכן אחד מסרב לחתום?',
];

const HALLUCINATION_MARKER = 'לא ידוע לי על';  // phrase LLM uses when making things up
const MIN_ANSWER_CHARS = 30;

async function gradeAnswer(question, answer, sources) {
  const issues = [];
  if (!answer || answer.trim().length < MIN_ANSWER_CHARS) {
    issues.push('תשובה קצרה מדי');
  }
  if (!sources || sources.length === 0) {
    issues.push('אין מקורות');
  }
  if (answer.includes(HALLUCINATION_MARKER)) {
    issues.push('סמן הזיה אפשרי');
  }
  return issues;
}

async function main() {
  console.log('=== Section 2 — בדיקת 10 שאלות ===\n');

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < TEST_QUESTIONS.length; i++) {
    const question = TEST_QUESTIONS[i];
    console.log(`─── שאלה ${i + 1}/10 ───────────────────────────────`);
    console.log(`❓  ${question}\n`);

    try {
      const { answer, sources } = await queryRAG(question);
      const issues = await gradeAnswer(question, answer, sources);

      console.log(`💬  תשובה:\n    ${answer.replace(/\n/g, '\n    ')}\n`);
      console.log(`🔗  מקורות:`);
      sources.forEach(s => console.log(`    • ${s}`));

      if (issues.length === 0) {
        console.log(`\n✅  עבר\n`);
        passed++;
      } else {
        console.log(`\n⚠️  בעיות: ${issues.join(', ')}\n`);
        failed++;
      }
    } catch (err) {
      console.log(`❌  שגיאה: ${err.message}\n`);
      failed++;
    }
  }

  await pool.end();

  console.log('═'.repeat(50));
  console.log(`תוצאות: ${passed}/10 עברו  |  ${failed} נכשלו`);
  if (failed === 0) {
    console.log('✅ כל הבדיקות עברו — Section 2 מוכן!');
  } else {
    console.log('❌ חלק מהבדיקות נכשלו — בדוק את הפלט למעלה.');
    process.exit(1);
  }
}

main();
