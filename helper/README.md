# Opus helper for Grok

A tiny MCP server on Cloudflare Workers (free plan) so Grok can save to opus-data.
Tools: read_opus_file (guide, plan, logs, outbox, growth, desk, memory), update_plan_section, leave_note, update_memory, save_plan (checked with Opus's own rules, refuses missing sections), add_to_outbox (merges into grok.json by key). It cannot write logs.json. Since 1.11.0 the Growth page is Cassius's alone (the owner's choice, 2026-11-20): Grok's address can't change growth.json.

Since 1.12.0 Cassius has his own address, https://opus-helper.<you>.workers.dev/<CASSIUS_KEY>/mcp, added in Claude as a second custom connector. It has every tool above, signed Cassius, plus save_growth (the version 2 Growth page). Since 1.14.0 there is nothing to put in Cloudflare: open https://opus-helper.<you>.workers.dev/<ACCESS_KEY>/cassius once and it makes Cassius's key, keeps it (sealed in opus-data/keys.json) and shows the finished address, the same one on every visit; add that address in Claude. Make a new address on that page if the old one ever leaks. A CASSIUS_KEY secret in Cloudflare, if set, still wins.

Since 1.16.0 the helper reads when its GITHUB_TOKEN runs out (GitHub says so on every answer), writes it to helper.json for Opus, and sends a notification a week and a day before. To renew: make a new token the same way (only opus-data, Contents read and write), then edit GITHUB_TOKEN in Cloudflare (Workers › opus-helper › Settings › Variables and Secrets). Also since 1.16.0, read_opus_file "guide" with no section gives the guide's short core; each tab has its own part (section "money", "food", "training", "home", "health", "outbox"…), and section "all" gives the whole guide.

worker.js is built from worker.src.js by `node build.js` (copies Plan.validate from site/js/core.js). The public copy for pasting is in the opus repo at helper/worker.js.

## Setup (owner)
1. Free Cloudflare account: dash.cloudflare.com/sign-up.
2. Workers & Pages > Create > Start with Hello World > name it opus-helper > Deploy.
3. Edit code > replace everything with helper/worker.js from donaldfischer15-lang.github.io/opus/helper/worker.js > Deploy.
4. A second fine-grained GitHub token: name "Opus helper", only opus-data, Contents read and write.
5. Worker > Settings > Variables and Secrets: add Secret GITHUB_TOKEN (the token) and Secret ACCESS_KEY (the random key the worker page shows when you open it). Deploy.
6. Open https://opus-helper.<you>.workers.dev/<ACCESS_KEY> to see the connector address.
7. grok.com/connectors > New Connector > Custom > paste the address.
8. Paste the new Grok prompt; set up Grok automations (Friday money week, etc.).

Revoke: delete the token on GitHub, or the worker in Cloudflare.

## Updates deploy themselves (one-time link, free)
Cloudflare builds the helper from `helper/` in the public opus repo (wrangler.jsonc there: name opus-helper, keep_vars, a check every 5 minutes for notifications).
Workers & Pages > opus-helper > Settings > Builds > Connect > GitHub > repo opus, branch main,
root directory `helper`, build command empty, deploy command `npx wrangler deploy`, build watch paths include `helper/*`.
Secrets stay in Cloudflare. Free plan: 3,000 build minutes a month; each build takes about a minute.
After each new version the helper writes `helper.json` in opus-data (within 5 minutes, or at Grok's next call); Opus warns in Settings if it is behind.

Last linked to Cloudflare builds: 2026-11-18. A copy of wrangler.jsonc also sits at the repo root, so the build deploys the helper even if its root directory is left blank.

## WHOOP (1.13.0, free, needs a WHOOP membership)
The helper pulls the owner's WHOOP recovery, sleep, strain and workouts into whoop.json in opus-data (hourly 4 AM to noon,
every 3 hours after, and on WHOOP's webhook if set). Setup:
1. developer.whoop.com > sign in with the WHOOP account > create a Team if asked > Create App.
   Name: Opus. Scopes: read:recovery, read:sleep, read:cycles, read:workout, read:body_measurement (and offline if listed).
   Redirect URL: https://opus-helper.<you>.workers.dev/whoop/callback . Privacy policy: https://<owner>.github.io/opus/privacy.html .
   Webhook URL (optional, model v2): https://opus-helper.<you>.workers.dev/whoop/webhook .
2. Open https://opus-helper.<you>.workers.dev/<ACCESS_KEY>/whoop, paste the app's Client ID and Client Secret there and Save
   (since 1.14.0; they're kept sealed in opus-data/keys.json, nothing goes into Cloudflare). Then tap Connect WHOOP.
   WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET secrets in Cloudflare, if set, still win.
The sign-in is kept in opus-data/whoop-auth.json, sealed (AES-GCM) with a key made from WHOOP_CLIENT_SECRET.
Disconnect: delete whoop-auth.json, or remove the app in WHOOP. Sandbox apps allow up to 10 WHOOP members, plenty for one.
