# Opus helper for Grok

A tiny MCP server on Cloudflare Workers (free plan) so Grok can save to opus-data.
Tools: read_opus_file (guide, plan, logs, outbox, growth, desk, memory), update_plan_section, leave_note, update_memory, save_plan (checked with Opus's own rules, refuses missing sections), add_to_outbox (merges into grok.json by key). It cannot write logs.json. Since 1.11.0 the Growth page is Cassius's alone (the owner's choice, 2026-11-20): Grok's address can't change growth.json.

Since 1.12.0 Cassius has his own address, https://opus-helper.<you>.workers.dev/<CASSIUS_KEY>/mcp, added in Claude as a second custom connector. It has every tool above, signed Cassius, plus save_growth (the version 2 Growth page). To set it up: open https://opus-helper.<you>.workers.dev/<ACCESS_KEY>/cassius, which shows a fresh key and the address it makes; add the key as Secret CASSIUS_KEY in Cloudflare; once the build finishes, add that address in Claude. The page never shows a key that is already set.

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
