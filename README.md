# Gabay Group AI Chatbot — Live Demo

I built a production-deployed AI chatbot for Gabay Group, a real estate company specializing in urban renewal (פינוי-בינוי / תמ"א 38).

## What it does

The chatbot answers customer questions in Hebrew using RAG (Retrieval-Augmented Generation) — it searches a knowledge base of 226 embedded chunks about Gabay's projects and returns accurate, context-aware answers in real time.

## Try it live

**Web:** https://gabay-ai-chatbot-production.up.railway.app

**WhatsApp:**
1. Save +1 415 523 8886 in your contacts
2. Send: `join <keyword>`
3. Ask any question in Hebrew

## Tech Stack

- **Backend:** Node.js / Express, PostgreSQL + pgvector (semantic search), OpenAI `text-embedding-3-small` + `gpt-4o`
- **Frontend:** React + TypeScript + Vite
- **Features:** Conversation history, rate limiting, dynamic follow-up suggestions, WhatsApp integration (Twilio), lead capture, query analytics
- **Deployed:** Railway (cloud), CI via GitHub

## Project Structure

```
gabay-ai-chatbot/
├── section1-data/        # Data ingestion — scraping, chunking, embedding, DB seed
├── section2-backend/     # Core RAG chain (queryRAG, generateFollowUps)
├── section3-frontend/    # Express server + React frontend (production build)
│   ├── server.js         # API routes: /api/chat, /api/whatsapp, /health
│   ├── chain.js          # Self-contained RAG chain for Railway deploy
│   └── frontend/         # React + TypeScript + Vite chat UI
├── package.json          # Root build/start scripts for Railway
└── railway.toml          # Railway deployment config
```

## Environment Variables

Copy `section3-frontend/.env.example` to `section3-frontend/.env` and fill in:

```
OPENAI_API_KEY=
DATABASE_URL=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```
