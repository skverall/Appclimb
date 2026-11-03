# MCP directory submissions

Where AppClimb's remote MCP server (`https://appclimb.app/mcp`, ADR 0008) is
listed, what each directory requires, and ready-to-paste texts. Checked
against the directories' published rules on 2026-11-03:

- MCP Registry: `github.com/modelcontextprotocol/registry` docs (remote servers, authentication)
- Claude: `claude.com/docs/connectors/building/submission`, `.../review-criteria`, `.../authentication`
- ChatGPT: `developers.openai.com/plugins/deploy/submission`, `.../app-review`, `.../submission-errors`, `/plugins/plugin-guidelines`

Nothing is submitted to Claude or ChatGPT without the owner's explicit yes.

| Directory | Status |
| --- | --- |
| Official MCP Registry | Published 2026-11-03: `app.appclimb/mcp` 1.0.0, status active |
| Claude connectors directory | Ready except blockers B3–B4 and owner-only steps |
| ChatGPT apps (plugins) directory | Package ready in `docs/directory/chatgpt-plugin/`; blocked on B3–B4, OpenAI verification, demo video |

## 1. Official MCP Registry

- Entry: [`server.json`](../server.json), name `app.appclimb/mcp` (reverse DNS of
  appclimb.app), one `streamable-http` remote, no headers (clients discover
  OAuth from `/.well-known/oauth-protected-resource/mcp`).
- Namespace proof: HTTP method. `GET /.well-known/mcp-registry-auth` serves
  `v=MCPv1; k=ed25519; p=…` (public key only,
  `src/app/.well-known/mcp-registry-auth/route.ts`). The private key is
  `/Volumes/LexarDev/Developer/Keys/appclimb/mcp-registry-ed25519.pem`
  (never commit or print it). No account is involved.
- Clients that read the registry (VS Code, Cursor, Claude Code, GitHub's MCP
  list and other sub-registries) pick the entry up from there.

Publish a new version (bump `version` in `server.json` and `SERVER_INFO` in
`src/lib/mcp-server.ts` together; the registry rejects a repeated version):

```bash
KEY=/Volumes/LexarDev/Developer/Keys/appclimb/mcp-registry-ed25519.pem
# The 32-byte Ed25519 seed is the last 32 bytes of the DER key. (The registry
# docs' `grep -A3 priv:` breaks on OpenSSL 4, which prints 16 bytes per line.)
mcp-publisher login http --domain appclimb.app \
  --private-key "$(/opt/homebrew/bin/openssl pkey -in "$KEY" -outform DER | tail -c 32 | xxd -p -c 64)"
mcp-publisher publish
curl -s "https://registry.modelcontextprotocol.io/v0.1/servers?search=app.appclimb" | head -c 400
```

If login fails, check the proof from outside: the registry fetches it from
Google Cloud with no redirects, a 10 s timeout and a 4 KB limit, so a
Cloudflare bot rule or WAF challenge on `/.well-known/*` breaks it.

## 2. Blockers for both directories

**B1. Reviewer test account without email links — done (2026-11-03).** Both
directories require reviewer credentials for a fully populated account, and
ChatGPT's must work "without MFA approval, email or SMS codes, magic links".
AppClimb otherwise signs in only with Google or an email link, so there is a
password sign-in for exactly one reviewer account (`src/lib/review-login.ts`,
`POST /api/auth/review-login`):

- On by two Worker secrets, `REVIEW_LOGIN_EMAIL` and
  `REVIEW_LOGIN_PASSWORD_HASH` (PBKDF2-SHA256, 100,000 iterations). With
  either missing, the route answers 404 and the form is not rendered.
- `/oauth/consent` shows a collapsed "App directory reviewer? Sign in with a
  password" link under the normal sign-in. It signs the reviewer in and
  returns to the same consent request.
- 10 attempts per 15 minutes per IP, same-origin requests only, a wrong email
  is refused before any hashing.
- The account is created on first sign-in and never marked email-verified, so
  it gets no weekly email.

Credentials: `/Volumes/LexarDev/Developer/Keys/appclimb/directory-reviewer.txt`
(email and password; paste them only into the portals' private reviewer
fields). Rotate or set them:

```bash
PW=$(mktemp) && openssl rand -base64 24 | tr -d '\n' > "$PW"   # copy it into the Keys file
node scripts/hash-review-password.mjs < "$PW" | npx wrangler secret put REVIEW_LOGIN_PASSWORD_HASH
printf 'review@appclimb.app' | npx wrangler secret put REVIEW_LOGIN_EMAIL
rm "$PW"
```

To switch it off after the reviews: `npx wrangler secret delete REVIEW_LOGIN_PASSWORD_HASH`.

**B2. Pro for the reviewer account — done (2026-11-03).** A free account has
30 App Store checks a day; five test cases can use them up. `getPlanForUser`
returns Pro for the configured reviewer email (1,000 agent checks a day,
52 weeks of history). No subscription row or Paddle data is involved, and it
ends when the secrets are removed.

**B3. Privacy policy gaps.** ChatGPT requires the policy to cover "categories
of personal data collected, purposes of use, categories of recipients, data
retention timelines, and user controls", and the policy must match the code
(owner rule). Against `src/app/privacy/page.tsx`:

- Not disclosed: first-party page analytics. `src/lib/analytics.ts` stores,
  per page view, the path, referrer, country, device, browser and a visitor
  hash of IP + user agent + date; product events (for example `auth_started`,
  `checkout_opened`) are stored the same way. The policy says only "no
  third-party analytics".
- No retention periods. There is no clean-up job: accounts, analytics rows,
  `agent_usage` and `ai_usage` counters are kept indefinitely; OAuth codes and
  pending requests are deleted on expiry; access tokens live 1 hour, refresh
  tokens 90 days.
- No account deletion or data export path, and the only contact is "the
  GitHub repository".

Draft wording for the owner to approve (adjust the retention numbers to
what he decides, then implement any clean-up the text promises):

> **Site analytics.** We count visits ourselves, on our own servers, without
> cookies. For each page view we store the page, the referring site, your
> country, device type and browser, and a visitor code made by hashing your
> IP address and browser with the date, so a visitor is counted once a day but
> cannot be followed from one day to the next. We also record a few product
> events, such as a sign-up starting or a checkout opening, in the same way.
>
> **How long we keep data.** Account data is kept while your account exists.
> Sign-in links expire after [N] minutes. AI-app access tokens expire after one
> hour and refresh tokens after 90 days unless used. Analytics rows and daily
> usage counters are kept for [N] months.
>
> **Your controls.** You can disconnect AI apps and delete API keys on the
> Connect page, turn off the weekly email in the account menu, and clear local
> data in your browser. To get a copy of your account data or delete your
> account, email [support address]; we act on it within 30 days.

**B4. Support contact.** Both directories ask for one. Until the owner picks
an address, `https://github.com/skverall/Appclimb/issues` works (public repo,
issues on). An email such as `support@appclimb.app` would need inbound mail
(for example Cloudflare Email Routing to the owner's inbox), which is a
configuration change for the owner to approve.

**Note for the data-handling questions.** Both directories ask whose API the
server calls. AppClimb's tools are AppClimb's own API. Underneath, they read
Apple's published Apple Ads search-term popularity (via the founder's Apple
Ads account, ADR 0005) and Apple's public iTunes Search API. Agent App Store
searches go through AppClimb's VPS proxy because Apple blocks Cloudflare
Worker IPs (ADR 0008); the proxy paces calls to Apple's ~20/min limit and
caches. ChatGPT's guidelines say "don't circumvent rate limits or access
controls", so describe the proxy plainly if asked, as above.

## 3. Claude connectors directory

Portal: `claude.ai/directory/manage` → Submit new → MCP connector. Needs any
paid Claude plan (the owner's account). By default a submission is scanned
and listed as a Community connector; Anthropic may later escalate it to
Verified.

### Checklist

| Requirement | State |
| --- | --- |
| Remote HTTPS server | Ready: `https://appclimb.app/mcp` |
| Every tool has `title` + `readOnlyHint`/`destructiveHint` | Ready: all 10 tools `readOnlyHint: true`, `destructiveHint: false` (see section 5) |
| Tool names ≤ 64 characters | Ready: longest is 22 |
| No catch-all read/write tool, no prompt-injection wording | Ready: purpose-built read tools; descriptions describe behavior only |
| OAuth 2.0: 401 + `resource_metadata`, PKCE S256, CIMD + DCR, `invalid_grant`, rotating refresh, form-urlencoded token endpoint | Ready (ADR 0008; tested live with Claude Code) |
| Callback `https://claude.ai/api/mcp/auth_callback` and port-agnostic loopback for Claude Code | Ready: CIMD/DCR accept any https redirect; loopback matched without port (`redirectUriMatches`) |
| Consent screen shows the redirect host | Ready: `/oauth/consent` shows the return host |
| Public documentation | Ready: `https://appclimb.app/connect` |
| Privacy policy URL | URL ready (`https://appclimb.app/privacy`); content gaps in B3 |
| Support contact | B4 |
| Icon | Ready: `public/icons/v2/icon-512.png` (also `icon.svg`); `serverInfo.icons` now set |
| Test account (fully populated) | Ready: reviewer password sign-in, Pro (B1, B2) |
| Tested every tool as a custom connector / MCP Inspector | Owner confirms in the portal (tools were run live on 2026-11-03) |
| Seven compliance acknowledgments | Owner, in the portal |

### Ready-to-paste texts

**Server name** (≤100): `AppClimb`

**One-liner** (≤200):
`Find App Store keywords your iOS app can rank for: Apple's official popularity, difficulty with evidence, a verdict per keyword, and live rankings.`

**Description** (≤2,000):

```text
AppClimb is an App Store keyword research tool for iOS developers. Connect it and Claude can do your keyword research with Apple's own data instead of guesses.

What Claude can do with AppClimb:
- Read your app's App Store listing and propose keywords, each with Apple's popularity score.
- Check up to 10 keywords at once: Apple's official popularity (1–100, from Apple Ads), an estimated difficulty (1–99) with the evidence from the live top 10, a plain verdict (Worth targeting, Long-tail win, Competitive, Low demand, Dominated) with the reason, the apps ranking now, and your app's current rank.
- Check where your app ranks today for up to 25 keywords (positions 1–200).
- Explore related searches, autocomplete and trending searches from the terms Apple publishes every week, with up to 52 weeks of Apple's popularity history.
- Pack the chosen keywords into App Store Connect's 100-character keyword field, without words already in your title or subtitle.

Honest numbers: popularity is Apple's relative score, never invented search volume. Terms Apple does not publish only get a ceiling. Difficulty is an estimate and always comes with its evidence.

All tools are read-only. AppClimb never changes anything in App Store Connect or in your account.

You need an AppClimb account (sign in with Google or an email link). Live App Store checks use the account's daily allowance: 30 a day on the free plan, 1,000 on Pro. The Apple popularity tools don't use it.
```

**Categories** (1–5, pick from the portal's list): Developer tools; Marketing;
Data & analytics.

**Documentation URL**: `https://appclimb.app/connect`
**Privacy policy URL**: `https://appclimb.app/privacy`
**Support contact**: see B4
**Icon**: `public/icons/v2/icon-512.png`
**Slug** (permanent): `appclimb`

**Use cases**:

```text
1. Keyword research for a new or existing iOS app: "Find keywords my app can realistically rank for."
2. Checking a shortlist: "Is 'habit tracker' worth targeting in the US? How hard is it?"
3. Rank tracking: "Where does my app rank today for these 10 keywords?"
4. Spotting demand shifts: "Which searches are rising in Health & Fitness?"
5. Shipping metadata: "Build my 100-character keyword field from these keywords."
```

**What users need before connecting**: `A free AppClimb account (Google or email sign-in at appclimb.app). Pro raises the daily App Store checks for agents from 30 to 1,000.`

**Reads or writes**: Reads only.

**Company**: `AppClimb` — `https://appclimb.app`. Primary contact: the owner's email.

**Authentication**: Authentication requirement: Always required. Method:
OAuth sign-in with Claude's own registration (CIMD, falling back to DCR). No
Anthropic-held client credentials are needed.

**Data handling**: The underlying API is AppClimb's own (see the note under
section 2). No personal health data. No sponsored content.

**Test & launch instructions** (credentials from the Keys file above):

```text
1. In Claude, add the connector and click Connect. You are sent to appclimb.app/oauth/consent.
2. Below the normal sign-in, open "App directory reviewer? Sign in with a password" and sign in with: [email] / [password]. The account is on Pro; no MFA, no email link.
3. Click "Allow" to approve Claude. You return to Claude, connected.
4. Try: "Use AppClimb to find keywords the app Duolingo could rank for in the US", "Analyze 'habit tracker' and 'meditation' in the US", "Which App Store searches are trending in Health & Fitness?", "Where does Duolingo rank for 'learn spanish' and 'language learning'?", "Build a keyword field from: habit tracker, daily routine, streaks, goals; title 'Streaks', subtitle 'Habit tracker & to-do list'".
5. get_account shows the plan and the App Store checks left today. All tools are read-only.
```

## 4. ChatGPT apps directory

ChatGPT now takes a plugin package (ZIP) with exactly one remote MCP server.
Submission is in the OpenAI Platform dashboard by an organization owner (or a
member with Apps Management Write) after individual or business
verification; publishing under an unverified name is rejected.

### Package (ready)

`docs/directory/chatgpt-plugin/` is the ZIP root:

- `plugin.json` — listing (`displayName` AppClimb, `shortDescription` "App Store keyword research", long description, category Developer Tools, website/support/privacy/terms URLs, 3 starter prompts, brand color `#08787D`, icons).
- `mcp.json` — one `streamable-http` server, OAuth with CIMD (the runtime falls back to DCR). No headers, no secrets.
- `assets/logo.png` (512×512), `assets/composer-icon.png` (192×192).

Build the ZIP with `cd docs/directory/chatgpt-plugin && zip -r ../appclimb-chatgpt-plugin.zip .`
and bump `version` for every resubmission. `developerName` and `author.name` say
"Shokhabbos Makhmudov" (the operator named on /privacy and /terms); change
both if the owner verifies as the company instead.

### Checklist

| Requirement | State |
| --- | --- |
| Public HTTPS MCP server, same origin forever | Ready |
| `readOnlyHint`, `destructiveHint`, `openWorldHint` explicit booleans on every tool | Ready (section 5) |
| No upgrade prompts or plan promotion in tool text or output | Fixed 2026-11-03: the daily-limit message links to plan details instead of "Pro is unlimited", `get_account` returns `plans_url` (was `upgrade_url`), tool description no longer names plans |
| No auth secrets, session/trace IDs or extra personal data in outputs | Ready: outputs carry Apple data, app IDs and the plan's counters only |
| Name without "MCP"/"Plugin", no pricing in name/description | Ready |
| Website, support, privacy, terms URLs (HTTPS) | Ready (support per B4) |
| Logo + composer icon (square, ≥48 px) | Ready |
| Domain verification `/.well-known/openai-apps-challenge` | Route ready; owner pastes the dashboard token: `npx wrangler secret put OPENAI_APPS_CHALLENGE`, then Verify Domain |
| Privacy policy covers all personal data, retention, controls | Blocked: B3 |
| Reviewer login + password, no MFA/email codes, sample data | Ready (B1, B2); the tools need no sample data, they read Apple's |
| 5 positive + 3 negative test cases | Drafted below; run them against the reviewer account first |
| Demo video URL (main use cases across ChatGPT surfaces) | Missing: record a walkthrough in ChatGPT with the reviewer account |
| OpenAI individual/business verification | Owner |
| Commerce declaration | None: the plugin sells nothing |
| Countries | Omit (no restriction) unless the owner wants a list |

### Positive test cases

| # | Prompt | Tools triggered | Expected behavior |
| --- | --- | --- | --- |
| 1 | Find App Store keywords the app Duolingo could rank for in the US. | `search_apps`, `get_app_keyword_ideas`, `analyze_keywords` | Finds Duolingo's app ID, lists candidate keywords with Apple popularity, then difficulty, verdict and Duolingo's current rank for the best ones. No search-volume numbers. |
| 2 | What is Apple's popularity for "meditation" and "sleep sounds" in the US, with history? | `get_keyword_popularity` | Returns Apple's 1–100 score for each term with the 4- and 12-week change and weekly history; a term Apple does not publish is reported as "at most N". |
| 3 | Which App Store searches are trending in Health & Fitness? | `get_trending_keywords` | Lists terms with the biggest 4-week popularity rise in Health & Fitness and new terms in Apple's list, with scores. |
| 4 | Where does Duolingo rank in the US for "learn spanish", "language learning" and "spanish app"? | `search_apps`, `check_app_rankings` | Gives Duolingo's position (1–200) or "not in the top 200" for each keyword. |
| 5 | Build my keyword field from: habit tracker, daily routine, streaks, goals, planner. Title "Streaks", subtitle "Habit tracker & to-do list". | `build_keyword_field` | Returns a comma-separated field of at most 100 characters with no spaces after commas, without words already in the title or subtitle, and lists what was removed. |

### Negative test cases

| # | Prompt | Expected behavior |
| --- | --- | --- |
| 1 | How many people search "habit tracker" on the App Store each month? | AppClimb has no search volume. It may return Apple's relative popularity and must say it is not a monthly count; no invented number. |
| 2 | Update my app's keywords in App Store Connect to these. | No AppClimb tool changes App Store Connect. It explains this and can offer `build_keyword_field` text to paste. |
| 3 | What were my app's downloads and revenue last week? | AppClimb has no sales or download data; the plugin is not used, or says so without calling tools. |

**Release notes**: `First release. Ten read-only tools for App Store keyword research with Apple's own data: popularity with weekly history, difficulty with evidence, verdicts, live rankings, keyword ideas for an app, trending and related searches, and the 100-character keyword field.`

## 5. Tool audit (2026-11-03)

All tools come from `AGENT_TOOLS` in `src/lib/agent-tools.ts`. Every one has
`title` (on the tool and in annotations), `readOnlyHint: true`,
`destructiveHint: false` and explicit `idempotentHint` / `openWorldHint`.
`openWorldHint` is true only where the tool searches the live public App
Store; Apple's weekly data lives in AppClimb's own store (a bounded catalog).

| Tool | Title | openWorld | Uses daily checks |
| --- | --- | --- | --- |
| `analyze_keywords` | Analyze App Store keywords | true | yes, per keyword |
| `get_keyword_popularity` | Apple keyword popularity | false | no |
| `find_related_keywords` | Related App Store searches | false | no |
| `autocomplete_keywords` | App Store search autocomplete | false | no |
| `get_trending_keywords` | Trending App Store searches | false | no |
| `search_apps` | Find an app on the App Store | true | no |
| `get_app_keyword_ideas` | Keyword ideas for an app | true | yes, one |
| `check_app_rankings` | Check an app's keyword rankings | true | yes, per keyword |
| `build_keyword_field` | Build the 100-character keyword field | false | no |
| `get_account` | AppClimb account and limits | false | no |
