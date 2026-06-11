require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const path        = require('path');
const express     = require('express');
const cors        = require('cors');
const rateLimit   = require('express-rate-limit');
const twilio      = require('twilio');
const { queryRAG, generateFollowUps, pool } = require('./chain');

const app  = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1); // required: Railway sits behind an HTTPS proxy; fixes req.protocol for Twilio sig validation

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── Rate limiting ────────────────────────────────────────────────────────────

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי בקשות. נסה שוב בעוד דקה.' },
});

// ─── Analytics helper ─────────────────────────────────────────────────────────

function logQuery(channel, question, answer, sources, durationMs) {
  pool.query(
    'INSERT INTO queries (channel, question, answer_len, sources, duration_ms) VALUES ($1, $2, $3, $4, $5)',
    [channel, question, answer.length, sources, durationMs],
  ).catch(err => console.error('analytics insert error:', err.message));
}

// ─── POST /api/chat ───────────────────────────────────────────────────────────

app.post('/api/chat', chatLimiter, async (req, res) => {
  const { message, history } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'נדרש שדה "message" שאינו ריק.' });
  }
  if (message.length > 500) {
    return res.status(400).json({ error: 'ההודעה ארוכה מדי. מקסימום 500 תווים.' });
  }

  // Validate history — must be an array of {role, content} objects if provided.
  let safeHistory = [];
  if (Array.isArray(history)) {
    safeHistory = history
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-10);
  }

  try {
    const start = Date.now();
    const { answer, sources } = await queryRAG(message.trim(), safeHistory);
    const durationMs = Date.now() - start;

    const followUps = await generateFollowUps(answer, message.trim());
    logQuery('web', message.trim(), answer, sources, durationMs);

    return res.json({ answer, sources, followUps });
  } catch (err) {
    console.error('/api/chat error:', err.message);
    return res.status(500).json({ error: 'שגיאה פנימית. נסה שוב מאוחר יותר.' });
  }
});

// ─── POST /api/whatsapp (Twilio webhook) ─────────────────────────────────────

const WHATSAPP_MAX = 1600;

app.post('/api/whatsapp', async (req, res) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    const signature = req.headers['x-twilio-signature'];
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    if (!twilio.validateRequest(authToken, signature, url, req.body)) {
      return res.status(403).send('Forbidden');
    }
  }

  const userMessage = (req.body.Body ?? '').trim();
  const fromNumber  = (req.body.From ?? '').trim();

  if (!userMessage) {
    return res.status(400).send('Missing message body');
  }

  // Lead capture — fire and forget, non-fatal
  if (fromNumber) {
    pool.query(
      `INSERT INTO leads (phone) VALUES ($1)
       ON CONFLICT (phone) DO UPDATE
         SET last_seen = NOW(), msg_count = leads.msg_count + 1`,
      [fromNumber],
    ).catch(err => console.error('leads upsert error:', err.message));
  }

  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const start = Date.now();
    const { answer, sources } = await queryRAG(userMessage);
    const durationMs = Date.now() - start;

    logQuery('whatsapp', userMessage, answer, sources, durationMs);

    let text = answer;
    if (text.length > WHATSAPP_MAX) {
      const window = text.slice(0, WHATSAPP_MAX - 30);
      const cut = Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('! '),
        window.lastIndexOf('? '),
        window.lastIndexOf('.\n'),
      );
      text = (cut > 0 ? window.slice(0, cut + 1) : window) + ' | מידע נוסף: gabaygroup.com';
    }

    twiml.message(text);
  } catch (err) {
    console.error('/api/whatsapp error:', err.message);
    twiml.message('מצטערים, אירעה שגיאה. אנא פנה אלינו: office@gabaygroup.com');
  }

  res.type('text/xml').send(twiml.toString());
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Serve React frontend (production) ───────────────────────────────────────

const DIST = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(DIST));
app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Gabay chatbot API listening on http://localhost:${PORT}`);
});
