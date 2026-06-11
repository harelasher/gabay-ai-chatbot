# Deployment Setup Guide
Everything you need to do manually, in order.

---

## Step 1 — Push the latest code to GitHub

```
git push origin master
```

---

## Step 2 — Create a Twilio account

1. Go to [twilio.com](https://www.twilio.com) and sign up (free)
2. Once inside the console, go to:
   **Messaging → Try it out → Send a WhatsApp message**
3. You'll see a sandbox page. Leave it open — you'll need it in Step 5.
4. Copy these two values from the top of the Twilio console:
   - **Account SID** (starts with `AC...`)
   - **Auth Token**

---

## Step 3 — Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select `harelasher/gabay-ai-chatbot`
4. When asked for the root directory, type: `/section3-frontend`
5. Click **Add Plugin → PostgreSQL**
6. Wait for the first build to finish (it will likely fail — that's fine, we haven't set the env vars yet)

---

## Step 4 — Set environment variables in Railway

Go to your service in Railway → **Variables** tab → add each of these:

| Variable | Where to get it |
|---|---|
| `NODE_ENV` | type: `production` |
| `OPENAI_API_KEY` | your OpenAI key |
| `DATABASE_URL` | Railway fills this automatically from the PostgreSQL plugin |
| `TWILIO_ACCOUNT_SID` | from Twilio Console (Step 2) |
| `TWILIO_AUTH_TOKEN` | from Twilio Console (Step 2) |
| `TWILIO_WHATSAPP_NUMBER` | type: `whatsapp:+14155238886` |

> Do NOT add `PORT` — Railway sets it automatically.

After saving, Railway will redeploy. Wait for it to go green.

---

## Step 5 — Copy your Railway URL

Once deployed, Railway gives you a public URL like:
```
https://gabay-chatbot-production.up.railway.app
```

Copy it. You'll need it for Step 6 and Step 7.

---

## Step 6 — Seed the database

The cloud database is empty. Run these commands **on your local machine**, replacing `<RAILWAY_DB_URL>` with the connection string from:
Railway → PostgreSQL plugin → **Connect** tab → copy the URL

```powershell
# 1. Create the tables
psql "<RAILWAY_DB_URL>" -f section1-data/db/setup.sql

# 2. Embed all content into the cloud DB (takes ~10 minutes)
cd section1-data
$env:DATABASE_URL = "<RAILWAY_DB_URL>"
node scripts/ingest.js

# 3. Confirm it worked
node scripts/verify.js
```

You should see **200+ chunks** at the end of verify.js.

---

## Step 7 — Connect Twilio to your Railway URL

1. Go back to Twilio Console → **Sandbox Settings**
2. Find the field **"When a message comes in"**
3. Set it to:
   ```
   https://<your-railway-url>/api/whatsapp
   ```
   Make sure method is set to **HTTP POST**
4. Click **Save**

---

## Step 8 — Join the WhatsApp sandbox

From your phone:
1. Open WhatsApp
2. Send the join message shown in the Twilio Sandbox page to **+1 415 523 8886**
   (it looks like: `join <two-words>`)
3. You'll get a confirmation reply from Twilio

---

## Step 9 — Test everything

**Web chat:**
- Open `https://<your-railway-url>` in a browser
- Ask "מה זה פינוי בינוי?" — you should get a Hebrew answer

**WhatsApp:**
- Send any Hebrew real estate question to **+1 415 523 8886**
- You should get a reply within 5 seconds

---

## Done ✓

Your chatbot is live. Share the Railway URL with the interviewer beforehand so they can try it.

**To show live data during the interview**, connect to the Railway PostgreSQL database and run:
```sql
-- Who messaged on WhatsApp
SELECT phone, msg_count, first_seen FROM leads ORDER BY first_seen DESC;

-- Most asked questions
SELECT question, COUNT(*) as times_asked
FROM queries GROUP BY question ORDER BY times_asked DESC LIMIT 10;

-- Average response time
SELECT AVG(duration_ms) as avg_ms FROM queries;
```
