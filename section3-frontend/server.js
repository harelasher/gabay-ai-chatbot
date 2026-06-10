require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors    = require('cors');
const twilio  = require('twilio');
const { queryRAG } = require('../section2-backend/src/chain');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── POST /api/chat ───────────────────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'נדרש שדה "message" שאינו ריק.' });
  }
  if (message.length > 500) {
    return res.status(400).json({ error: 'ההודעה ארוכה מדי. מקסימום 500 תווים.' });
  }
  try {
    const { answer, sources } = await queryRAG(message.trim());
    return res.json({ answer, sources });
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
  if (!userMessage) {
    return res.status(400).send('Missing message body');
  }

  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const { answer } = await queryRAG(userMessage);
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

app.listen(PORT, () => {
  console.log(`Gabay chatbot API listening on http://localhost:${PORT}`);
});
