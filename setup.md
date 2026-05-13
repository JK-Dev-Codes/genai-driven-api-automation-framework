# Setup Guide — GenAI-Driven API Automation Framework

## Prerequisites

| Requirement | Minimum Version |
|---|---|
| Node.js | 18.x or higher (20.x recommended) |
| npm | 8.x or higher |
| TypeScript | Installed via `npm install` (no global install needed) |

---

## 1. Install Dependencies

```bash
npm install
```

This installs all runtime and dev dependencies defined in `package.json`:
- `@cucumber/cucumber` — BDD test runner
- `@playwright/test` — HTTP client + SSO browser login
- `openai` — GPT-4o integration
- `dotenv` — environment variable loading
- `ts-node`, `typescript` — TypeScript execution

---

## 2. Install Playwright Browsers

Required for SSO browser-based token extraction.

```bash
npx playwright install chromium
```

---

## 3. Create the `.env` File

Create a `.env` file in the project root. This file is **never committed** to source control.

```env
# ── API Target ──────────────────────────────────────────────────────────────
API_BASE_URL=https://your-api-base-url

# ── OpenAI ──────────────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-...

# ── Authentication (choose one) ─────────────────────────────────────────────

# Option A — Static Bearer token (simple apps, service accounts)
CLIENT_API_TOKEN=your-bearer-token-here

# Option B — SSO browser login (PingFederate / MyID style)
SESSION_AUTH=browser
BASE_URL=https://your-app-url-that-triggers-sso-redirect
USER_EMAIL=your-login-email@company.com
USER_PASSWORD=your-password

# ── SSO Selectors (Option B only — override defaults if your SSO page differs) ──
# SSO_EMAIL_SELECTOR=#login-username
# SSO_NEXT_SELECTOR=#login-next
# SSO_PASSWORD_SELECTOR=#login-password
# SSO_SUBMIT_SELECTOR=#login-submit
# SSO_TWO_STEP=true
# SSO_TOKEN_COOKIE_NAME=id_token
# SSO_SUCCESS_URL_PATTERN=**/home**

# ── Logging ─────────────────────────────────────────────────────────────────
# Levels: error | warn | info | debug  (default: info)
LOG_LEVEL=info

# ── Optional ─────────────────────────────────────────────────────────────────
# TIMEOUT=30000        # HTTP request timeout in ms (default: 30000)
# APP_NAME=default     # App config name under src/config/apps/
```

### Required variables at minimum

| Variable | When required |
|---|---|
| `API_BASE_URL` | Always |
| `OPENAI_API_KEY` | Always (AI prompt generation + self-heal) |
| `CLIENT_API_TOKEN` | When using static Bearer token auth |
| `SESSION_AUTH=browser` + `BASE_URL` + `USER_EMAIL` + `USER_PASSWORD` | When using SSO login |

---

## 4. Add an App Config (Optional)

If you target multiple applications, create a config file at:

```
src/config/apps/<your-app-name>.config.json
```

Example:

```json
{
  "appName": "myApp",
  "baseURL": "https://your-api-base-url",
  "auth": {
    "type": "Bearer",
    "token": "${YOUR_API_TOKEN}"
  },
  "headers": {},
  "timeout": 30000
}
```

`${YOUR_API_TOKEN}` is resolved from `.env` at runtime. If no app config exists, `default.config.json` is used with `API_BASE_URL` and `CLIENT_API_TOKEN` from `.env`.

---

## 5. Bootstrap API Contracts (One-time per endpoint)

Contracts are auto-generated from a real API call and stored under `src/contracts/definitions/`. Run this once per endpoint before generating tests.

```bash
npm run bootstrap -- --endpoint POST:/alliances --payload '{"name":"Test_","description":"desc","leaders":[{"id":"<uuid>"}],"portfolioId":"<uuid>","draft":false}'
npm run bootstrap -- --endpoint POST:/tribes --payload '{"name":"fleet_","description":"desc","allianceId":"<uuid>","draft":false}'
npm run bootstrap -- --endpoint POST:/squads --payload '{"name":"squad_","description":"desc","tribeId":"<uuid>","draft":false}'
```

This creates:
- `src/contracts/definitions/<entity>.contract.json` — schema, required fields, response fields
- `src/data/<entity>.json` — reusable payload file for test generation

---

## 6. Verify the Setup

Run the TypeScript compiler to check there are no errors:

```bash
npx tsc --noEmit
```

Run all existing feature files:

```bash
npm test
```

Run a single feature file:

```bash
npx cucumber-js --profile single "src/features/PDS-XXXXX.feature"
```

---

## 7. Generate a Test from a Prompt

Write a plain English prompt file (see `prompts/createUser.prompt.txt` as an example), then run:

```bash
npm run prompt -- prompts/yourPrompt.txt PDS-XXXXX.feature
```

This will:
1. Send the prompt to GPT-4o and generate a Gherkin feature file
2. Auto-heal any undefined steps (up to 3 retries)
3. Execute the generated tests and report results

---

## Project Structure (Quick Reference)

```
src/
  ai/              — AI engine, prompt parser, step generator, bootstrap
  config/          — App configs (apps/*.config.json)
  contracts/       — Auto-generated API contracts (definitions/*.contract.json)
  data/            — Reusable payload JSON files
  features/        — Generated .feature files
  steps/           — Cucumber step definitions
  utils/           — Logger, helpers, token extractor
prompts/           — Plain English prompt files
output/            — Test reports (HTML + JSON)
.env               — Local environment variables (not committed)
cucumber.js        — Cucumber profiles (default + single)
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `OPENAI_API_KEY` not set error | Add the key to `.env` |
| `Response field "id" not found` | Check `API_BASE_URL` in `.env` points to the correct environment |
| SSO login times out | Verify `BASE_URL`, `USER_EMAIL`, `USER_PASSWORD` in `.env`; check SSO selectors |
| `422` on POST /tribes or /squads | Run bootstrap for `/alliances` first so `{{allianceId}}` placeholder is set |
| TypeScript errors after pulling changes | Run `npm install` then `npx tsc --noEmit` |
