# CLAUDE.md — Gabay Group AI Chatbot

## Project Overview

Hebrew-only AI chatbot for Gabay Group (Israeli real estate, urban renewal). Uses RAG to answer customer questions about פינוי-בינוי, תמ"א 38, and Gabay's projects.

Live URL: `https://gabay-ai-chatbot-production.up.railway.app`
GitHub: `https://github.com/harelasher/gabay-ai-chatbot`

---

## Project Structure

```
gabay-ai-chatbot/
├── section1-data/          # Scraping, chunking, embedding, DB seed
│   ├── ingest.js           # Embeds chunks and inserts into pgvector
│   └── db/setup.sql        # Schema: chunks, leads, queries tables
├── section2-backend/       # Core RAG logic (reference only, not deployed)
│   └── src/chain.js        # queryRAG, generateFollowUps
├── section3-frontend/      # The deployed app (Railway)
│   ├── server.js           # Express API: /api/chat, /api/whatsapp, /health
│   ├── chain.js            # Self-contained copy of chain.js for Railway
│   ├── package.json        # Dependencies + build/start scripts
│   ├── railway.toml        # Railway deploy config (section-level)
│   ├── .env                # Real secrets — NEVER commit
│   ├── .env.example        # Placeholder template — safe to commit
│   └── frontend/           # React + TypeScript + Vite chat UI
│       └── src/
│           ├── App.tsx
│           ├── api.ts
│           ├── ChatWindow.tsx
│           └── SuggestedChips.tsx
├── package.json            # Root scripts for Railway monorepo deploy
├── railway.toml            # Root Railway deploy config
├── PLAN.md                 # Feature roadmap and implementation guide
└── SETUP_GUIDE.md          # Step-by-step deployment + WhatsApp setup
```

---

## Infrastructure

| Service | Details |
|---|---|
| **Hosting** | Railway (Node.js, auto-deploy from GitHub `master`) |
| **Database** | Railway PostgreSQL + pgvector extension |
| **DB URL** | `postgresql://postgres:...@acela.proxy.rlwy.net:24254/railway` |
| **Embeddings** | OpenAI `text-embedding-3-small` (1536-dim), 226 chunks seeded |
| **LLM** | `gpt-4o` (temp=0.2) for answers, `gpt-4o-mini` for follow-ups |
| **WhatsApp** | Twilio Sandbox → webhook `/api/whatsapp` |

---

## Security Rules — Never Break These

- `.env` files must **never** be committed to git
- API keys must **never** be hardcoded in source files
- All OpenAI/DB calls go through the Express backend only — never expose keys on the frontend
- Do **not** commit unless explicitly told to by the user

---

## Key Implementation Details

### RAG Chain (`section3-frontend/chain.js`)
- `queryRAG(question, history = [])` — embeds question, cosine similarity search, builds GPT-4o prompt with last 6 history messages
- `generateFollowUps(answer, question)` — gpt-4o-mini returns 2 Hebrew follow-up chips as JSON array, never throws

### Server (`section3-frontend/server.js`)
- `app.set('trust proxy', 1)` — required for Railway HTTPS proxy (fixes Twilio signature validation)
- Rate limit: 20 req/min per IP on `/api/chat` (Hebrew 429 message)
- `/api/whatsapp` validates Twilio signature before processing
- Lead capture: upserts phone number to `leads` table (fire-and-forget)
- Analytics: logs every query to `queries` table with duration_ms

### Frontend (`section3-frontend/frontend/`)
- All user-facing text in Hebrew
- `SuggestedChips` shows dynamic follow-ups from API, falls back to 4 static defaults
- History built from `messages` state, `bot` role mapped to `assistant`

### Railway Monorepo Deploy
- Root `package.json` uses `npm --prefix` to build in subdirectories
- `chain.js` is a self-contained copy in `section3-frontend/` — Railway can't reach `../section2-backend/`
- Clear "Root Directory" field in Railway service settings (must be empty, not `section3-frontend`)

---

## Database Schema

```sql
-- Embedded knowledge base
chunks (id, content, source, embedding vector(1536))

-- WhatsApp lead capture
leads (id, phone UNIQUE, first_seen, last_seen, msg_count)

-- Query analytics
queries (id, channel CHECK('web','whatsapp'), question, answer_len, sources TEXT[], duration_ms, created_at)
```

---

## Environment Variables (Railway + local `.env`)

```
OPENAI_API_KEY=
DATABASE_URL=
PORT=                        # injected by Railway automatically
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
RAILWAY_URL=gabay-ai-chatbot-production.up.railway.app
```

---

## WhatsApp Setup

- Twilio sandbox number: **+1 415 523 8886**
- Webhook URL: `https://gabay-ai-chatbot-production.up.railway.app/api/whatsapp` (HTTP POST)
- New users must send `join <keyword>` to the sandbox number before chatting
- Max 10 phone numbers joined simultaneously on free sandbox
- Sandbox never expires; free trial credit ($15.50) is separate and not used by sandbox messages
