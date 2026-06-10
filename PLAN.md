# Gabay AI Chatbot — Implementation Guide

> This file is a step-by-step prompt for Claude to follow.
> Each section has: what to build, exact do's and don'ts, and how to test it.
> Work through sections in order. Do not skip ahead.

---

## Global Rules

- **All user-facing text must be Hebrew.** Error messages, placeholders, button labels — everything.
- **Never hardcode API keys, DB passwords, or secrets.** Always read from `process.env`.
- **Never commit `.env` files.** Only `.env.example` with placeholder values.
- **Never break existing behaviour.** Each feature is additive. Run the full test suite after every section.
- **No unused code.** If something is added temporarily for debugging, remove it before committing.
- **Commit after each section**, not at the end. Message format: `feat: <section name>`.

---

## Section 1 — Deploy to Railway

### What this does
Prepares the codebase so Railway can build the React frontend and serve it from the same Express server that handles the API. One process, one URL, one database.

### Files to create / edit

#### `section3-frontend/server.js`

**DO:**
- Add `app.set('trust proxy', 1)` as the very first line after `const app = express()`. This makes `req.protocol` return `https` behind Railway's reverse proxy, which is required for Twilio signature validation to pass.
- After the `/health` route and before `app.listen`, add two blocks:
  1. `express.static` pointing at `path.join(__dirname, 'frontend', 'dist')` — serves the compiled React app
  2. A catch-all `app.get('*', ...)` that returns `index.html` for any unknown route — this is required for React Router (SPA behaviour)
- The catch-all must come **after** all `/api/*` routes so API calls are never intercepted by it.

**DON'T:**
- Don't move the `require('path')` that's already in the dotenv line — reuse it.
- Don't add `express.static` before the API routes. Order matters: API routes first, static files second, catch-all last.
- Don't set a hardcoded port in this file. `process.env.PORT` is already used — leave it.

#### `section3-frontend/package.json`

**DO:**
- Add a `"build"` script: `"cd frontend && npm install && npm run build"`. This installs frontend devDependencies (Vite, TypeScript) and compiles the React app to `frontend/dist/`.
- Keep the existing `"start": "node server.js"` script unchanged.

**DON'T:**
- Don't add `"type": "module"` — the server uses CommonJS (`require`).
- Don't install frontend packages in the root `package.json`. They belong in `frontend/package.json`.

#### `section3-frontend/railway.toml` _(new file)_

**DO:**
- Set `builder = "NIXPACKS"` — Railway's auto-detection for Node.js.
- Set `buildCommand = "npm run build"` — runs the frontend compilation before deploy.
- Set `startCommand = "npm start"` — boots the Express server.
- Set `healthcheckPath = "/health"` — Railway uses this to know the service is ready.
- Set `restartPolicyType = "ON_FAILURE"` with `restartPolicyMaxRetries = 3`.

**DON'T:**
- Don't set a `PORT` variable here. Railway injects it automatically and the app already reads `process.env.PORT`.

#### `section3-frontend/.railwayignore` _(new file)_

**DO:**
- Ignore `node_modules`, `frontend/node_modules`, `frontend/dist`, `.env`, `*.log`.
- This keeps the deploy payload small and prevents secrets from being uploaded.

**DON'T:**
- Don't ignore `frontend/src` or `frontend/package.json` — Railway needs those to build.

---

### Manual steps (user does these, not Claude)

1. Go to [railway.app](https://railway.app) → sign in with GitHub
2. New Project → Deploy from GitHub → `harelasher/gabay-ai-chatbot`
3. Set root directory to `/section3-frontend`
4. Add plugin: **PostgreSQL**
5. Set these environment variables in the Railway dashboard:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `OPENAI_API_KEY` | OpenAI key |
| `DATABASE_URL` | auto-filled by PostgreSQL plugin — copy from Connect tab |
| `TWILIO_ACCOUNT_SID` | from Twilio Console |
| `TWILIO_AUTH_TOKEN` | from Twilio Console |
| `TWILIO_WHATSAPP_NUMBER` | `whatsapp:+14155238886` |

> Do NOT add `PORT`. Railway sets it. Adding it breaks the bind.

---

### Seed the database (user runs locally once)

```powershell
# 1. Create schema + enable pgvector
psql "<RAILWAY_DB_URL>" -f section1-data/db/setup.sql

# 2. Embed all content into the cloud DB (~10 min)
cd section1-data
$env:DATABASE_URL = "<RAILWAY_DB_URL>"
node scripts/ingest.js

# 3. Verify
node scripts/verify.js   # must print: 200+ chunks, all have embeddings
```

---

### Tests for Section 1

After deploying, verify all of the following pass:

```
[ ] GET  https://<railway-url>/health          → { "status": "ok" }
[ ] GET  https://<railway-url>/                → HTML page with <title>קבוצת גבאי</title>
[ ] GET  https://<railway-url>/anything-random → same HTML (SPA fallback works)
[ ] POST https://<railway-url>/api/chat        → { answer: "...", sources: [...] }
     body: { "message": "מה זה פינוי בינוי?" }
[ ] POST https://<railway-url>/api/chat        → 400 + Hebrew error
     body: { "message": "" }
[ ] POST https://<railway-url>/api/chat        → 400 + Hebrew error
     body: { "message": "x".repeat(501) }
```

---

## Section 2 — WhatsApp

### What this does
The `/api/whatsapp` Twilio webhook is already coded. This section confirms it works end-to-end with a real Twilio account and the live Railway URL. No code changes needed — this is setup and verification only.

### How it works (for reference)
When a WhatsApp message arrives:
1. Twilio sends an HTTP POST to `/api/whatsapp` with the message body and a signature header
2. `server.js` validates the Twilio signature using `TWILIO_AUTH_TOKEN` — rejects with 403 if invalid
3. The message text is passed to `queryRAG()` which returns a Hebrew answer
4. The answer is truncated to 1600 characters at the last sentence boundary if needed
5. The response is wrapped in TwiML and sent back to Twilio, which delivers it to the user's WhatsApp

### Setup steps (user does these)

1. Create a free Twilio account at [twilio.com](https://twilio.com)
2. Go to **Console → Messaging → Try it out → Send a WhatsApp message**
3. Set the **Sandbox webhook** to:
   ```
   https://<your-railway-url>/api/whatsapp    [HTTP POST]
   ```
4. Save
5. From any phone, send the sandbox join message (shown in the Twilio console) to `+1 415 523 8886` on WhatsApp
6. Once joined, send a Hebrew question

### Tests for Section 2

```
[ ] Send "מה זה פינוי בינוי?" via WhatsApp → Hebrew answer arrives within 5 seconds
[ ] Send "כיצד ליצור קשר עם גבאי?" → answer contains 03-5612055 and office@gabaygroup.com
[ ] Send a very long question (500+ chars) → bot still replies, no crash
[ ] Send an empty message or just spaces → no reply or a clean Hebrew error (not a 500)
[ ] Check Railway logs → no unhandled exceptions during the above
```

---

## Section 3 — Conversation History

### What this does
Currently every question is independent — the bot has no memory of what was said before. This adds multi-turn context: the last 3 exchanges (6 messages) are passed to GPT-4o so the bot can answer follow-up questions like "ספר לי עוד" or "ומה לגבי הדיירים?".

### Files to edit

#### `section2-backend/src/chain.js`

**DO:**
- Change the `queryRAG(question)` signature to `queryRAG(question, history = [])`.
- `history` is an array of `{ role: 'user' | 'assistant', content: string }` objects.
- When building the messages array for OpenAI, insert `...history.slice(-6)` between the system prompt and the final user message. Slicing to 6 items means a maximum of 3 back-and-forth exchanges — enough for context without wasting tokens.
- The final user message still includes the retrieved chunks as context (the RAG part is unchanged).
- Keep the function signature backward-compatible: `history` defaults to `[]` so all existing callers still work.

**DON'T:**
- Don't include history in the embedding query. The vector search still uses only the current question — not the full conversation — because searching by conversation history produces worse results.
- Don't pass more than 6 history messages. GPT-4o charges per token; 3 exchanges in Hebrew is ~2,000 tokens. More than that risks both cost and context overflow.
- Don't store history inside `chain.js`. It is stateless. History is owned by the caller (the API server or the frontend).

#### `section3-frontend/server.js`

**DO:**
- Update the `/api/chat` handler to accept an optional `history` array in the request body.
- Validate that `history`, if present, is an array of objects each with a `role` string (`'user'` or `'assistant'`) and a `content` string.
- Strip any extra fields from history items before passing downstream — only `role` and `content`.
- Pass the validated history to `queryRAG(message, history)`.
- Cap history at 10 items server-side (the last 10) as a safety limit, even if the client sends more.

**DON'T:**
- Don't trust `role` values from the client blindly. Only allow `'user'` and `'assistant'`. Reject or strip anything else.
- Don't make `history` required. If the client sends no history, default to `[]` — the bot still works as before.

#### `section3-frontend/frontend/src/api.ts`

**DO:**
- Add `history?: Array<{ role: 'user' | 'assistant', content: string }>` to the `sendMessage` parameter.
- Include `history` in the POST body when calling `/api/chat`.

**DON'T:**
- Don't send the full `Message[]` array from the app state directly — strip out the `id`, `sources`, and any other UI-only fields. Only send `role` and `content`.

#### `section3-frontend/frontend/src/App.tsx`

**DO:**
- Build a `history` array from the current `messages` state before each `sendMessage` call.
- Map `role: 'bot'` → `role: 'assistant'` (the API uses OpenAI convention).
- Only include messages that have text content (exclude the welcome message if it might confuse context).
- Pass `history` to `sendMessage`.

**DON'T:**
- Don't include the welcome message in history. It's a UI element, not a real exchange.
- Don't include `sources` or `id` fields in history objects sent to the API.

---

### Tests for Section 3

Run this manually in the web UI after implementing:

```
[ ] Ask "מה זה פינוי בינוי?" → get a definition
[ ] Ask "ומה לגבי הזכות לסרב?" (no mention of פינוי בינוי) → bot understands the context and answers about refusal rights
[ ] Ask "ספר לי עוד" → bot elaborates on the previous topic, not a generic answer
[ ] Start a fresh conversation (reload page) → history is cleared, no context from the previous session
[ ] POST /api/chat with history containing a role other than 'user'/'assistant' → 400 error or the field is silently stripped
[ ] POST /api/chat with history: [] → works identically to no history field at all
```

---

## Section 4 — Rate Limiting

### What this does
Adds a request rate limiter to `/api/chat` so that a single IP cannot flood the server with requests and drain the OpenAI credits. This is a basic but important security control.

### Files to edit

#### `section3-frontend/package.json`

**DO:**
- Add `express-rate-limit` to `dependencies`.

#### `section3-frontend/server.js`

**DO:**
- Import `express-rate-limit` at the top of the file.
- Create a limiter: **20 requests per IP per minute** on `/api/chat`.
- When the limit is exceeded, respond with HTTP 429 and a Hebrew JSON error: `{ "error": "יותר מדי בקשות. נסה שוב בעוד דקה." }`.
- Apply the limiter as middleware only on the `/api/chat` route, not globally.
- Do not apply a rate limiter to `/api/whatsapp` by IP — Twilio always calls from the same IP. Leave that endpoint unlimited for now.

**DON'T:**
- Don't block the health check endpoint.
- Don't set the limit below 20/min — legitimate users might send several questions in a row.
- Don't use `res.send()` for the error — use `res.json()` so the frontend can parse it.
- Don't add rate limiting to static file serving — that would break the frontend.

---

### Tests for Section 4

```
[ ] Send 20 requests to POST /api/chat in under 1 minute → all succeed (HTTP 200)
[ ] Send the 21st request → HTTP 429 with Hebrew JSON error body
[ ] Wait 1 minute → requests succeed again (window resets)
[ ] POST /api/whatsapp (simulate Twilio) → not affected by the rate limiter
[ ] GET /health → not affected by the rate limiter
```

---

## Section 5 — Lead Capture

### What this does
Every WhatsApp conversation reveals a phone number (`req.body.From`, format: `whatsapp:+972501234567`). This section logs those numbers to a `leads` table in PostgreSQL. During the interview, you can run a query and show real people who contacted the bot.

### Files to edit

#### `section1-data/db/setup.sql`

**DO:**
- Add a `leads` table at the end of the file:
  ```sql
  CREATE TABLE IF NOT EXISTS leads (
    id         SERIAL PRIMARY KEY,
    phone      TEXT    NOT NULL UNIQUE,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen  TIMESTAMPTZ DEFAULT NOW(),
    msg_count  INTEGER DEFAULT 1
  );
  ```
- Use `IF NOT EXISTS` so re-running the file is safe.

**DON'T:**
- Don't store the message content in this table — only the phone number and timestamps. Storing message content raises privacy concerns.

#### `section3-frontend/server.js`

**DO:**
- In the `/api/whatsapp` handler, after Twilio signature validation passes, extract `req.body.From` as the phone number.
- Upsert into the `leads` table:
  - If the number is new: insert with `msg_count = 1`
  - If it already exists: update `last_seen = NOW()` and increment `msg_count`
  - Use a single `INSERT ... ON CONFLICT (phone) DO UPDATE` statement
- The upsert must complete regardless of whether the RAG query succeeds or fails.
- Use the same `pool` instance that `chain.js` uses — import it, or create one from `DATABASE_URL`.

**DON'T:**
- Don't await the upsert before responding to Twilio. Twilio has a 15-second timeout. Run the upsert fire-and-forget, or await it concurrently with the RAG call.
- Don't crash the request if the upsert fails (e.g. DB is temporarily unreachable) — wrap in try/catch and log the error.
- Don't log the phone number to `console.log` — it's personal data.

---

### Tests for Section 5

```
[ ] Send a WhatsApp message → SELECT * FROM leads shows 1 row with the correct phone, msg_count = 1
[ ] Send another message from the same number → msg_count = 2, last_seen updated
[ ] Send from a second phone number → 2 rows in leads table
[ ] Simulate a DB error during upsert → WhatsApp message is still answered (upsert failure is non-fatal)
[ ] Confirm phone numbers are not written to server logs
```

---

## Section 6 — Query Analytics

### What this does
Logs every question asked (on both web and WhatsApp), the response time, and the sources returned. During the interview you can show: "Here are the top 5 questions people asked" and "average response time is X ms".

### Files to edit

#### `section1-data/db/setup.sql`

**DO:**
- Add a `queries` table:
  ```sql
  CREATE TABLE IF NOT EXISTS queries (
    id          SERIAL PRIMARY KEY,
    channel     TEXT         NOT NULL CHECK (channel IN ('web', 'whatsapp')),
    question    TEXT         NOT NULL,
    answer_len  INTEGER,
    sources     TEXT[],
    duration_ms INTEGER,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
  );
  ```
- The `CHECK` constraint on `channel` ensures only valid values are stored.

**DON'T:**
- Don't store the full answer text — `answer_len` (character count) is enough and avoids storing large amounts of text.

#### `section3-frontend/server.js`

**DO:**
- In the `/api/chat` handler: record `Date.now()` before calling `queryRAG`, then log to `queries` after it resolves with `channel = 'web'`.
- In the `/api/whatsapp` handler: same pattern with `channel = 'whatsapp'`.
- Log: `question`, `answer_len`, `sources` (array of URLs), `duration_ms`.
- Use a fire-and-forget insert (don't await it) so analytics never slows down the response.
- Wrap in try/catch — a logging failure must never cause the request to fail.

**DON'T:**
- Don't log questions that result in validation errors (e.g. empty message). Only log successful RAG calls.
- Don't log the full answer text — only its length.
- Don't await the insert before responding to the user.

---

### Tests for Section 6

```
[ ] Ask a question via the web UI → SELECT * FROM queries shows 1 row, channel = 'web', duration_ms > 0
[ ] Ask via WhatsApp → channel = 'whatsapp'
[ ] SELECT AVG(duration_ms) FROM queries → returns a sensible number (e.g. 1500–4000ms)
[ ] SELECT question, COUNT(*) FROM queries GROUP BY question ORDER BY COUNT(*) DESC → top questions list works
[ ] Simulate a DB error during insert → the user still gets their answer, no 500 error
[ ] Check that answer text is NOT stored — only answer_len (integer)
```

---

## Section 7 — Dynamic Follow-Up Chips

### What this does
After each bot reply, 2 follow-up question suggestions appear as clickable chips below the answer. They are generated by `gpt-4o-mini` based on the bot's answer — cheaper and faster than `gpt-4o`. Clicking a chip sends it as a new question. The existing static chips (shown at the start) are replaced by dynamic ones after the first exchange.

### Files to edit

#### `section2-backend/src/chain.js`

**DO:**
- Add a new exported function `generateFollowUps(answer, question)`.
- Call `openai.chat.completions.create` with model `gpt-4o-mini`, temperature `0.5`.
- The prompt: ask for exactly 2 short follow-up questions in Hebrew, related to the answer, that a real estate buyer might ask. Return them as a JSON array of strings.
- Parse the response as JSON. If parsing fails, return `[]` — never throw.
- Keep it short: max 100 tokens for the completion. Follow-up questions are 5–8 words each.

**DON'T:**
- Don't use `gpt-4o` for this — it's overkill for 2 short questions and adds latency.
- Don't make this function `async` from `queryRAG` — call it in parallel with the main RAG call or after it, but don't add to the critical path for the answer.
- Don't return more than 2 suggestions — 3+ clutters the UI.

#### `section3-frontend/server.js`

**DO:**
- In the `/api/chat` handler, after `queryRAG` resolves, call `generateFollowUps(answer, message)` in parallel (using `Promise.all` or starting it before awaiting the RAG call is not possible — start it immediately after RAG resolves).
- Add `followUps: string[]` to the JSON response alongside `answer` and `sources`.
- If `generateFollowUps` fails or times out, respond with `followUps: []` — it's non-critical.

**DON'T:**
- Don't await `generateFollowUps` before sending the answer. It can resolve slightly after the RAG call and be included in the same response. Use `Promise.all([queryRAG(...), ...])` approach or await them sequentially — either is fine, sequential is simpler.
- Don't add follow-up chips to the WhatsApp response — WhatsApp doesn't have a UI for chips.

#### `section3-frontend/frontend/src/api.ts`

**DO:**
- Add `followUps?: string[]` to the `ChatResponse` interface.

#### `section3-frontend/frontend/src/App.tsx`

**DO:**
- Add `followUps?: string[]` to the `Message` interface.
- When a bot message is received, store `followUps` in the message object.
- After the last bot message, pass `followUps` to `SuggestedChips` instead of (or in addition to) the static chips.
- If `followUps` is empty or undefined, fall back to the static chips.

#### `section3-frontend/frontend/src/SuggestedChips.tsx`

**DO:**
- Accept a `chips?: string[]` prop that overrides the static `CHIPS` array when provided.
- Keep the static `CHIPS` constant as the default.

**DON'T:**
- Don't show both static and dynamic chips at the same time — that's too many buttons.
- Don't show the chips while a response is loading — only show them when `loading === false`.

---

### Tests for Section 7

```
[ ] Ask any question in the web UI → 2 follow-up chips appear below the answer
[ ] The chips are in Hebrew
[ ] Clicking a chip sends that question and gets an answer
[ ] After the new answer, the chips update to reflect the new topic
[ ] Before any question is asked (welcome state), the static chips are shown
[ ] If the backend returns followUps: [], the static chips are shown as fallback
[ ] WhatsApp response does not include follow-up text
[ ] POST /api/chat response always includes a "followUps" array (even if empty)
```

---

## Final Checklist

Run all of these after completing every section:

```
DEPLOYMENT
[ ] https://<railway-url>           → chat UI loads in Hebrew
[ ] https://<railway-url>/health    → { "status": "ok" }
[ ] https://<railway-url>/anything  → index.html (SPA fallback)

WEB CHAT
[ ] Ask "מה זה פינוי בינוי?"           → Hebrew answer with sources
[ ] Ask "כיצד ליצור קשר עם גבאי?"      → full contact block (phone, email, address)
[ ] Ask "ספר לי עוד" (follow-up)       → context-aware response (Section 3)
[ ] 21st request in a minute          → HTTP 429 Hebrew error (Section 4)
[ ] 2 follow-up chips after every answer                (Section 7)

WHATSAPP
[ ] Hebrew question via WhatsApp       → answer in under 5 seconds
[ ] leads table updated after message  → (Section 5)

DATABASE
[ ] SELECT COUNT(*) FROM chunks        → 200+
[ ] SELECT COUNT(*) FROM leads         → at least 1 after a WhatsApp test
[ ] SELECT COUNT(*) FROM queries       → grows with every question asked
[ ] SELECT AVG(duration_ms) FROM queries → sensible (1000–5000ms range)
```
