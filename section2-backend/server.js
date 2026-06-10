require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const { queryRAG } = require('./chain');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Gabay chatbot API listening on http://localhost:${PORT}`);
});
