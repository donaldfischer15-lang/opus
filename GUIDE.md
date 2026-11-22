# Opus guide for AI helpers (Claude, Grok)

Opus is a personal phone app (a home-screen web app). It reads **one plan file** and keeps **logs** on the phone. You help by editing the plan, reading the logs, and adding entries such as a weekly money block. Everything is plain JSON or plain text.

## Reading this guide

This first part (the core) is the rules every helper needs. Each tab has its own part below. Read the one for what you're doing, with `read_opus_file` file `guide` and `section` (the word in quotes):

| part | section | read it to |
|---|---|---|
| 1. The plan file | `"1"` | the plan's shape, the schedule, Today's checklist, writing and the weekly review |
| 2. Money | `"money"` | bills, debts, free cash, transfers, money weeks |
| 3. Logs | `"logs"` | read what the owner entered on the phone |
| 4. Your outbox | `"outbox"` | the rules for logging anything in `grok.json` |
| 5. The Growth page | `"growth"` | Cassius only: `growth.json` |
| 6. The desk | `"desk"` | leave Claude a note about the app |
| 7. The shared memory | `"memory"` | `memory.md` |
| 8. WHOOP | `"whoop"` | sleep, recovery and strain |
| 9. Food | `"food"` | meals, portions, macros, saved foods, food eaten |
| 10. Training | `"training"` | workouts, exercises, progression, plate math |
| 11. Home and pets | `"home"` | home jobs, pets and pet care |
| 12. Health | `"health"` | supplements, blood tests, daily amounts |
| 13. Good requests | `"requests"` | examples of what the owner asks and what to do |

`section` `"all"` gives the whole guide, in parts.

## Where the data lives

The owner keeps Opus data in a **private GitHub repo** (usually `opus-data`). Opus pulls it every time it opens and pushes the phone's logs back. These files sit in the repo:

| file | who writes it | what it is |
|---|---|---|
| `plan.json` | **you** and the app | the plan (section 1, and each tab's own part). Edit it in place. |
| `logs.json` | **only the app** | everything logged on the phone (section 3). Read it, never edit it. |
| `grok.json` | **only you** | your outbox: entries you log for the owner (section 4). |
| `growth.json` | **only the teacher** (Cassius) | the Growth page: the Lamp, Before class, the Seal, the Season, the Map, the Portrait, the Library and Cassius's notes (section 5). Cassius writes it, through his own helper address (`save_growth`) or by committing it whole; the app only reads it. **Grok never writes it** (the owner's choice, 2026-11-20): Grok's helper address can read it but has no way to change it. |
| `GUIDE.md` | the app | this guide. |
| `desk.json` | you, Cassius and Claude | the shared desk: notes about the app itself, and Claude's replies (section 6). |
| `memory.md` | you, Cassius and Claude | the shared memory: what you know about the owner, so Claude knows it too (section 7). |
| `push.json` | only the app | the phone's notification schedule. Never edit it. |
| `whoop.json` | only the Opus helper | the owner's WHOOP data by day (section 8). Read it, never edit it. |
| `whoop-auth.json` | only the Opus helper | the WHOOP sign-in, sealed so only the helper can open it. Never read, edit or copy it. Deleting it disconnects WHOOP. |
| `keys.json` | only the Opus helper | keys the helper keeps for itself (Cassius's address, the WHOOP app), sealed. Never read, edit, copy or delete it: deleting it cuts Cassius off and disconnects WHOOP. |
| `helper.json` | the Opus helper | which helper version is live (`{ "version", "since" }`). Opus warns the owner when it is behind. |
| `backups/opus-backup-YYYY-MM.json` | the app, once a month | a full backup (plan, logs and settings, `"format": "opus-data"`) from the first sync of that month. Never edit these. To restore one, the owner imports it in Settings › Your data › Import backup. |

### The Opus helper (the "opus" connector)

If you have the opus connector, use its tools; they check everything before saving and say exactly what was wrong if something isn't saved.

| tool | use it to |
|---|---|
| `read_opus_file` | read `guide` (this core; add `section` for a tab's part), `plan`, `logs`, `outbox`, `growth`, `desk`, `memory` or `whoop`. Long files come in parts of about 14,000 characters (the first line says "part 1 of N"; ask for the next with `part`). Read less with `section` (`"money"`, `"money.debts"`, `"training"`, logs `"workouts"`, guide `"4"`, memory `"Training"`) and `since` (`"YYYY-MM-DD"`, list entries from that date on). |
| `update_plan_section` | change one part of the plan (`"money"`, `"money.debts"`, `"training.schedule"`…). Only that part is replaced, so edits the owner or Claude made elsewhere are safe. Read the part first and send it back whole. **Use this for almost every plan change.** |
| `save_plan` | replace the whole plan. Only when the change touches many parts; read every part first. |
| `add_to_outbox` | log entries for the owner (section 4). |
| `leave_note` | leave a note on the desk for Claude, answer one (`re`), or mark one of yours done (`close`). |
| `update_memory` | add facts about the owner to the shared memory (`add`), rewrite a section (`replace`) or delete facts (`remove`). |

If the owner hasn't set up the repo, or your connector can't write files, use the paste route instead: reply with the whole file in one code block and the owner pastes it into Opus (Settings › Plan › Import plan, or Money › Weekly money import).

## The ground rules

1. **Never invent numbers.** If a weight, balance, rate, bill amount or paycheck is unknown, use `null`. The app shows a blank the owner fills in. Fill a number only from what the owner told you or from their accounts.
2. **Keep `plan.json` whole and valid.** It is one JSON object with `"format": "opus-plan"`. Change only what was asked or clearly needs it, and leave everything else exactly as it is. Opus checks the file before it uses it. If it is broken, Opus keeps the plan it had and shows the owner the first problem, and nothing is lost.
3. **Keep ids stable.** Logs point at ids (`back-squat`, `breakfast`, `trash`). Rename the `name` or `title`, never the id, unless you mean to start fresh.
4. **Set `"updated"`** to today's date (`YYYY-MM-DD`) when you change the plan.
5. **Never touch logs you didn't write.** Don't edit or delete `logs.json`. To log something for the owner, put it in `grok.json`.
6. **Say what you changed**, in a line, after each change: which file and what.
7. Times are 24-hour `"HH:MM"`. Days are `sun mon tue wed thu fri sat`.

## Keeping Opus current

The owner should never have to tell you something twice, or tell you to save it. Two habits keep Opus up to date.

**1. Save as you go, without being asked.** Whenever something comes up in any chat that belongs in Opus, save it right away with the opus tools, then say in one line what you saved (for example: "Saved to Opus: phone bill is now $95, due the 12th."). This covers:

- a bill, a debt, a balance, an interest rate, a payday or a due date (plan `money`)
- a change to meals, portions, macros or saved foods (plan `food`)
- a change to workouts, exercises, starting weights or the schedule (plan `training`)
- a new home job or a change to one (plan `home`), and anything about a pet: breed, birthday, food, vet, how often a care job is due (plan `home.pets`)
- a supplement started, stopped or changed (plan `health.supplements`)
- a weigh-in, a meal or food eaten, a workout done, or today's cash (the outbox, section 4)
- blood test results, from a report or a photo of one (the outbox `labs`, section 12)
- pet care done, a pet weigh-in or a vet visit (the outbox `pets`), and a supplement taken (the outbox `supps`)

Don't save guesses. If one detail is missing (an amount, a date), save what you know with `null` for the rest and ask for just that detail. If the owner is only thinking out loud ("maybe I'll drop Spotify"), ask before you change anything.

**2. "Sync Opus".** When the owner says **Sync Opus** (or "update Opus"), do all of this, in order, then report:

1. Read `logs` section `sync` and the outbox. If `sync.outbox.updated` doesn't match the outbox's `updated`, Opus hasn't picked up your last entries yet. Say so and don't send them again.
2. Read the `plan` and the logs since your last sync (`since`). Note anything the owner logged that changes the plan (for example a debt balance that moved, or a meal that keeps getting skipped).
3. If you can see the owner's accounts: save today's Free cash (`money.cash`), and last week's money block (`money.weeks`) if it isn't in the logs yet.
4. Fill every blank (`null`) in the plan that you can answer from the owner's own words or accounts, with `update_plan_section`.
5. Apply any change the owner asked for since your last sync that isn't in the plan yet.
6. Report in a few short lines: what you saved, then **what only the owner can answer**, as a short list of questions.

## How changes meet

- The owner may change the plan on the phone while you change it in GitHub (for example a debt balance, a meal's macros, or an exercise added in the logger). Opus merges both, part by part. When the same value was changed in both places, **your copy in GitHub wins**, and the owner can undo the whole update from Settings › Sync.
- Logs only grow from a sync. A log leaves only when the owner removes it on the phone.
- Small partial changes are fine: edit just the meal, the debt or the workout you mean, in place. You never need to resend the whole plan when you write to GitHub.
- **The owner sees what you changed.** When a sync brings in a change to `plan.json`, `growth.json` or an entry of yours in `grok.json`, the tab it belongs to gets a dot and a short *What changed* card at the top, worked out from the data itself (for example "Credit card rate set to 24.99%" or "New recall question"). You don't need to write a separate change note. Opus names who made it from the start of the newest commit message on `plan.json` (`Grok:`, `Cassius:` or `Claude:`), so keep the helper's `change` line honest and specific. Change only what you mean to: a rewrite of a whole section shows up as a long list of changes.

## How the owner moves files without sync

- **Plan to you:** Settings › Plan › *Copy plan*, then paste to you.
- **Plan back:** Settings › Plan › *Import plan*, paste your JSON, *Check plan*, *Use this plan*. Return the whole plan in one code block for this.
- **Logs to you:** Settings › Your data › *Copy a 2-week summary* (plain text), or *Export backup* (full JSON, section 3).
- **Money each Friday:** Money › Weekly money import, paste the `OPUS MONEY WEEK` block (section 2).

---

## 1. The plan file (`"format": "opus-plan"`, `"version": 1`)

```json
{
  "format": "opus-plan",
  "version": 1,
  "name": "Example plan",
  "updated": "2026-11-18",
  "notes": "free text",
  "profile":  { "name": "", "motto": "Strong body. Clear mind. Easy life." },
  "schedule": { ... },
  "routine":  [ ... ],
  "food":     { ... },
  "training": { ... },
  "money":    { ... },
  "home":     { "items": [ ... ] },
  "mind":     { "writing": { ... } },
  "review":   { ... }
}
```

Each tab's part of the plan is described in that tab's part of this guide: `food` (9), `training` (10), `money` (2), `home` (11), `health` (12).

### schedule
| key | meaning |
|---|---|
| `wake`, `lightsOut` | `"05:00"`, `"21:30"` |
| `workdays` | list of day keys that are work days |
| `workStart`, `workEnd` | on workdays, Part II (Workday) starts at `workStart`, Part III (Evening) at `workEnd` |
| `dayOffMidday`, `dayOffEvening` | on days off, when Part II (Midday) and Part III start |

### routine (the daily checklist on Today)
Each item: `{ "id", "title", "part", "time", "days", "kind", "meal", "detail", "daysOff" }`
- `part`: `morning`, `workday` or `evening`.
- `days`: omit for every day, or `"workdays"`, `"daysoff"`, or a list like `["mon","wed"]`.
- `meal`: `breakfast`, `lunch`, `snack` or `dinner`. The title becomes "Lunch: chicken rice bowl" from this week's rotation.
- `kind`: `workout` (shows only on training days, opens the logger), `writing`, `weigh`, or omit for a plain task.
- `daysOff`: overrides for days off, e.g. `{ "part": "workday", "time": "11:00" }`.

Opus also adds these to Today by itself: home items due that day, food prep on `food.prepDay`, the money check-in on `money.checkInDay`, the weekly review on `review.day`.

### mind and review
```json
"mind":   { "writing": { "goal": "I write clearly", "sentences": 5, "prompts": ["..."] } },
"review": { "day": "sun", "time": "19:30", "questions": ["What worked?", "What slipped?", "One change for next week"] }
```

---

## 2. Money

### The plan's `money`
```json
{
  "currency": "USD",
  "takeHomePerWeek": 650,
  "countOvertime": false,
  "payday": "fri", "checkInDay": "fri", "checkInTime": "18:30",
  "plannedDebtPerWeek": null,
  "cushion": null,
  "bills": [ { "name": "Car insurance", "amount": 151, "every": "month", "dueDay": 14 } ],
  "debts": [ { "name": "Credit card", "balance": null, "apr": null, "minMonthly": null } ]
}
```
- `debts` are in **payoff order**. The first with a balance above zero is the focus.
- `counted: false` on a debt keeps it listed but leaves it out of every debt figure: total debt, the focus, payoff order, the debt-free date and debt charts. Its payment is a regular bill. **It is the owner's rule:** never set it back to counted, keep its balance current, and never count it in any debt total, payoff plan or debt-free date you work out in chat either. Why each one is set that way is in `money.notes`.
- `every` is `week`, `month` or `year`.
- A debt can also hold what a credit report shows about it, all optional: `lender`, `limit` (a card's credit limit; Money shows how much of it is used), `highest` (highest balance), `termMonths` and `opened` (`YYYY-MM-DD`; Money works out the month of the last payment), `lastPayment` (date), `onTime` (`true`, `false`, or a short line such as `"81% on time"`), `reported` (the date the report's balance is from), `loans` (a list of each loan's balance when one debt is several loans) and `note` (one short line). Leave out what you don't know.
- `credit` (optional) is the Credit part of Money, from the owner's credit report. Replace it whole each time you read a new report, and add that day's scores to `history` (keep the older entries):
```json
"credit": {
  "asOf": "YYYY-MM-DD", "source": "where it came from",
  "scores": [ { "bureau": "TransUnion", "score": 700, "change": 10, "band": "Good" } ],
  "factors": [ { "name": "Card use", "value": "4%", "rating": "Excellent", "impact": "high", "note": "one short line" } ],
  "inquiries": [ { "lender": "…", "date": "YYYY-MM-DD" } ],
  "cards": [ { "name": "…", "balance": 0, "limit": 1000 } ],
  "netWorth": -1000,
  "history": [ { "date": "YYYY-MM-DD", "scores": { "TransUnion": 700 } } ]
}
```
  `cards` are open cards that are not in `debts` (for example ones at $0). A card with a balance the owner is paying off belongs in `debts`. `change` is what the report says the score moved since its last read. Never guess a score or a figure; leave it out.
- `sub: true` on a bill marks a subscription. Money totals them in one line.
- `due` (optional) lists one-time amounts with a date, such as the rest of a card statement: `[{ "name": "…", "amount": 262.38, "date": "YYYY-MM-DD" }]`. They show on the bill calendar on that day and are never counted as a monthly bill. Remove an entry once it is paid or past.
- `spendGroups` sorts spending: the store name exactly as you log it in `spent`, in lower case, mapped to one group: Groceries, Eating out, Pets, Gas, Clothes & gear, Health, Fun, Home, Gifts, Cash, Transfers or Other. Add a store only when you are sure what it is. Leave the rest out: Opus shows them as "Not sorted yet" and Claude asks the owner.
- `split` is the plan for one paycheck: `{ "bills": …, "food": …, "spending": …, "debt": … }`. The check-in shows each week's actual against it (food is the Groceries and Eating out groups).
- `checkins` holds the owner's weekly check-in, keyed by week ending (the payday): `extra` (an extra amount planned to the focus debt that week, taken out of Yours this week), `to` (which debt), `note` (the owner's one line for the week) and `done`. The phone writes these; read them, don't change them. A planned `extra` is what the owner means to pay, not a payment: log the payment in the money week when it happens.
- `oneOff` marks single purchases the owner chose to leave out of the average week, keyed `week_ending|store in lower case|amount with 2 decimals` (for example `2026-11-12|hardware store|42.50`). The owner sets these on the phone; don't add or remove them.
- Take-home on Money is the average of the last 4 logged paychecks. The debt-free date and each debt's payoff month follow the owner's pace: the average of `debtPayments` (to counted debts, not bills) over the last 4 logged weeks, or `plannedDebtPerWeek` until 2 weeks are logged. So log every debt payment in the money week, named as the debt is named here.
- `cushion`: cash to keep before any extra debt payment (the owner's rule). Money shows when extra can go to debt.
- **Yours this week** (Money, section III) = today's Free cash − food until payday (the top of `food.budgetPerWeek`, per day) − this week's `plannedDebtPerWeek` (less any `debtPayments` already in the current money week). It is what the owner can spend on anything, or put toward debt as extra.
- The plan's average week (shown under it) = take-home − bills (weekly share) − `plannedDebtPerWeek` − normal spending (average of the last 4 imported weeks; the grocery budget until then).
- `dueDay` (optional) is the day of the month a bill comes out. Give it whenever you know it: the week ahead on Today lists bills by due day (dated `held` items in the latest `money.cash` come first), and it says when no bill has one.
- `account` (optional) on a bill is the account it comes out of, spelled exactly as in `money.cash` `accounts` (e.g. the checking account the payment is drawn from). Set it whenever you know it. Money then checks each account against the bills due from it before payday, counting money on its way to it, and when one is short it says how much to move, from the account with the most in it, by the day before the first bill it can't cover. Never move money yourself; tell the owner.
- Notifications: the owner's phone writes `push.json` in this repo (its push address and the next week of reminders, worked out from the plan). Never edit `push.json`. Reminders follow the plan, so a time on a routine item, a bill's `dueDay` and a pet's care `every` all become reminders. When you save a change, the `change` line you send is shown to the owner as a notification, so write it as a short plain sentence ("Credit card rate set to 24.99%").
- Debt-free date: each month pays every minimum, then the rest of the debt money goes to the first debt in order. Interest uses `apr` when set.

### Money in your outbox (`money.cash`, `money.weeks`, `money.balances`)

The outbox rules are in section 4; these are the money ones.

- **Free cash (`money.cash`)** is the big number at the top of Money: the cash the owner can use that isn't needed for bills or anything else before the next payday (`money.payday` in the plan).
  - `cash` is the total in the accounts they spend from (checking plus cash; not savings unless they say so). List each in `accounts`.
  - `held` is everything that has to come out before payday: bills due by then (loan minimums included) and money they set aside. Leave out the weekly `plannedDebtPerWeek` payment: Opus takes that out itself in Yours this week. If you do list it, name it with the word "debt" so Opus doesn't count it twice. Give each a `due` date when it has one.
  - `free` is `cash` minus everything in `held`. If you leave it out, Opus works it out.
  - `at` is when you read the accounts (ISO time). One entry per day: send the same `date` again to update it. The newest reading wins, even over one the owner typed in.
  - Update it whenever you look at their accounts, and at least once a day if you can.
  - **Moving money between the owner's own accounts is never spending.** A transfer from one of their accounts to another (to cover a bill paid from the second, say) leaves `cash` the same. While it is on its way (gone from one account, not yet in the other), list it in `transfers`: `[{ "from": "Checking", "to": "Bills account", "amount": 400, "pending": true }]`, and keep the bill it is for in `held`. Once it lands, send the new balances and `"transfers": []`. Opus then works out `cash` and `free` itself from the accounts, the money on its way and `held`, so don't take a transfer out of `free`. In a money week, a transfer goes in `transfers` (`{ "from", "to", "amount" }`), never in `spent`; Opus shows it as moved and leaves it out of the totals.
  - **Update one account at a time** when that's all you read: send that day's `date` with just `accounts` (each `{ "name", "amount", "at" }`, `at` being when you read that account) and no `cash`, `free` or `held`. The helper folds it into that day's reading and keeps the other accounts with their own times; Opus works out the totals. On a new day, an entry with only `accounts` keeps the last `held` list (minus anything past due). Use the same account names every time, as in earlier readings. Give `at` on each account only when you actually read that account then: Money shows each balance with its time, and marks one older than a day and a half.
- A money week's `balances` also update the matching debts' `balance` in the plan (names match `money.debts[].name`, case does not matter), just like a pasted money block.

### The weekly money block (paste route, every Friday)

With sync, put the week in `grok.json` instead (section 4). Without it, Grok replies with this block and the owner pastes it.

Plain text, one item per line. Amounts are plain dollar numbers. Leave out any line you do not know.

```
OPUS MONEY WEEK
week_ending: 2026-11-27
paycheck: 650.00
spent: groceries 124.50
spent: gas 48.00
spent: eating out 22.10
bill: car insurance 151.00
debt_payment: credit card 50.00
balance: credit card 1840.00
note: optional, one line
END
```
- `week_ending` is the Friday, `YYYY-MM-DD`.
- `spent` is everyday spending by category. Do **not** include bills or debt payments in `spent`.
- `balance` names must match the debt `name` values in the plan exactly (case does not matter).
- Take-home is the most recent paycheck in the logs (`money.weeks`), overtime included. `takeHomePerWeek` in the plan is used only until the first paycheck is logged, so log every week's `paycheck`.
- JSON also works: `{ "format": "opus-money-week", "week_ending": "...", "paycheck": 650, "spent": [{ "category": "groceries", "amount": 124.5 }], "bills": [{ "name": "...", "amount": 0 }], "debt_payments": [...], "balances": [{ "name": "...", "balance": 0 }] }`

The app previews the block and lists any problems before saving.

---

## 3. Logs (`logs.json`, `"format": "opus-logs"`) and backups (`"format": "opus-data"`)

`logs.json` in the repo holds the keys below (no `plan`, `active` or `settings`). A backup file (Settings › Your data › Export backup) holds all of them plus the plan. Both are read-only for you.

| key | shape |
|---|---|
| `plan` | the plan file above (backup only) |
| `checks` | `{ "2026-11-24": ["breakfast", "home:trash", "workout", ...] }` items checked off each day. `"growth-lesson"` on a date = the owner marked that day's lesson as learned. |
| `workouts` | `[{ "id", "workout": "lower-a", "name", "date", "started", "finished", "sets": [{ "ex", "weight", "reps", "at", "pr" }], "conditioning": true, "warmup": [...], "cooldown": [...], "note": "..." }]` (`warmup` and `cooldown` list the items ticked; `pr` true = new best estimated 1-rep max; `workout` is `"free"` for a session built on the spot; `catchUp` true = logged afterwards, so it has no real duration) |
| `active` | a workout in progress, or `null` (backup only) |
| `weights` | `[{ "date", "lb" }]` |
| `money.weeks` | saved weekly money blocks: `{ "weekEnding", "paycheck", "spent": [{ "cat", "amount" }], "bills": [{ "name", "amount" }], "debtPayments": [{ "name", "amount" }], "balances": [{ "name", "amount" }], "notes": [] }` |
| `money.balances` | `[{ "date", "debts": { "Credit card": 1840 } }]` balance history |
| `money.cash` | `[{ "date", "at", "cash", "accounts": [{ "name", "amount", "at" }], "transfers": [{ "from", "to", "amount", "pending" }], "held": [{ "name", "amount", "due" }], "free", "note" }]` Free cash readings, one per day: cash on hand, money on its way between the owner's own accounts, what is held back before payday, and what is left (`free`). The newest `at` wins, whoever made it. Entries with no `by` were entered by the owner. |
| `sync` | `{ "at", "app", "outbox": { "updated", "added", "changed", "removed", "kept": [...], "skipped": [...] } }` when Opus last synced (it writes this at least once on each day it's opened) and what it took from `grok.json` the last time that file changed. If `outbox.updated` matches the `updated` time in `grok.json`, Opus has picked up your latest entries. `kept` = entries where the owner's own entry won; `skipped` = entries Opus refused, with the reason. |
| `prefs` | `{ "restSeconds": { "<exercise id>": 150 }, "tabs": [...], "hiddenTabs": [...], "sound": true }` the owner's settings, for reference only |
| `groceries` | `{ "<week-start date>": ["Eggs", ...] }` items checked while shopping |
| `prep` | prep steps done per week |
| `reviews` | `[{ "weekOf", "worked", "slipped", "change", "saved" }]` |
| `writing` | `[{ "date", "text", "words", "sentences", "prompt", "kind" }]` (`"kind": "lesson"` = an answer to the lesson's question, and `prompt` is that question; `"kind": "recall"` = an answer to the Growth page's Back again question, written from memory; `teachback`, `workshop`, `walk` = answers to those kinds of sitting; `seal` = his answer to the Seal's question; `prompt` is always the question; no `kind` = the day's writing practice) |
| `ledger` | (retired with Growth version 2; old entries stay) `[{ "week", "virtue", "date", "mark", "at" }]` the owner's nightly marks on the week's virtue (Growth › The Ledger): one per date, `mark` is `"clean"` or `"dot"` (a fault), `week` is that week's Monday and `virtue` the virtue it was marked against. Count the dots per virtue to see which one keeps collecting them. |
| `reading` | `[{ "id", "page", "date", "done" }]` the owner's page in each book from `growth.json` `reading` (`done` true = finished) |
| `kept` | `[{ "id", "date", "text", "from" }]` the owner's Commonplace: Lamps kept (`id` `lamp:<date>`) and lines copied from books (`id` `line:<...>`). Older entries have no `id`. |
| `glimpses` | `[{ "id", "date", "line", "who", "at" }]` the owner's Glimpses: one line when a moment came together, and who was there. Never asked for. |
| `eaten` | what was actually eaten, when it differs from the plan. **A planned meal:** `{ "id": "<date>:<routine item id>", "date", "item", "meal", "name", "parts": [{ "name", "unit", "planned", "ate", "macros" }], "macros", "at" }` (part of it was eaten, or more or less; `macros` is what was eaten), or the same with `"skipped": true` (not eaten). A planned meal that is ticked in `checks` with no entry here was eaten as planned. **Something extra:** `{ "id", "date", "extra": true, "name", "amount", "unit", "slot", "macros", "at" }` (`macros` may be `null`; `slot` is breakfast, lunch, snack or dinner). |
| `labs` | blood test results: `{ "date", "lab", "markers": [{ "name", "value", "unit", "range", "low", "high" }], "note", "at" }`, one entry per test date. `range` is the lab's reference range as printed; `low` and `high` are its numbers. A value below `low` or above `high` shows as outside the lab's range. |
| `pets` | pet care done, weigh-ins and vet visits: `{ "id": "<date>:<pet id>:<care id>", "date", "pet", "care", "lb", "note", "at" }`. `care` is a care id from the pet, or `"weight"` (with `lb`) or `"vet"` (with `note`). |
| `supps` | supplements taken: `{ "id": "<date>:<supplement id>", "date", "supp", "at" }`, one per supplement per day. A row on Today counts as done when every supplement in it was taken. |
| `deleted` | `{ "workouts": { "<id>": "<when>" }, "eaten": { "<id>": "<when>" }, "labs": { "<date>": "<when>" }, "pets": { "<id>": "<when>" }, "supps": { "<id>": "<when>" }, "ledger": { "<date>": "<when>" } }` entries the owner removed (a cleared ledger box is in `ledger`), so they stay removed |
| `settings` | tab order, hidden tabs, rest timer overrides, sound, last backup (backup only) |

Entries that came from you carry `"by": "grok"`.

### Everything the owner enters, and where it is

You never need the owner to repeat something they entered in Opus. It is all here:

| they did this on the phone | read it in |
|---|---|
| ticked a meal, a routine item, a home job or the lesson | `logs.json` `checks` |
| ate only part of a meal, more or less of it, or skipped it | `logs.json` `eaten` (by meal and part) |
| added food that wasn't in the plan | `logs.json` `eaten` (`"extra": true`) |
| saved a food to "my foods" | `plan.json` `food.library` |
| entered a blood test | `logs.json` `labs` |
| ticked a supplement, or added or changed one | `logs.json` `supps`; `plan.json` `health.supplements` |
| did pet care, weighed a pet, logged a vet visit | `logs.json` `pets` |
| changed a pet's details or how often a care job is due | `plan.json` `home.pets` |
| picked which daily amounts to compare against | `plan.json` `health.reference` |
| logged a workout or a set | `logs.json` `workouts` |
| weighed in | `logs.json` `weights` |
| entered cash on hand (Money › Free cash › Update it myself) | `logs.json` `money.cash` |
| did the weekly money check-in | `logs.json` `money.weeks` |
| updated a debt balance | `logs.json` `money.balances`, and the debt's `balance` in `plan.json` |
| changed money numbers, a bill, a debt, a meal, an exercise or a home job | `plan.json` |
| ticked groceries or prep | `logs.json` `groceries`, `prep` |
| wrote, answered a lesson or the recall question, kept words, moved a bookmark | `logs.json` `writing`, `kept`, `reading` |
| marked a night clean or with a dot in The Ledger | `logs.json` `ledger` |
| did the weekly review | `logs.json` `reviews` |
| changed rest timers, tabs or sound | `logs.json` `prefs` |

---

## 4. Your outbox (`grok.json`, `"format": "opus-grok"`)

The outbox has exactly nine sections: **`money.cash`, `money.weeks`, `money.balances`, `weights`, `workouts`, `eaten`, `labs`, `pets`, `supps`**. Anything else is refused by name, and every refused entry is listed with the field that was wrong.

Put only new or corrected entries here. You may replace the whole file each time; Opus copies each entry into the logs once and keeps it, even after you take it out of this file.

```json
{
  "format": "opus-grok",
  "version": 1,
  "updated": "2026-11-27T18:40:00Z",
  "money": {
    "weeks": [
      { "weekEnding": "2026-11-27", "paycheck": 650.00,
        "spent": [ { "cat": "groceries", "amount": 124.50 }, { "cat": "gas", "amount": 48.00 } ],
        "bills": [ { "name": "Car insurance", "amount": 151.00 } ],
        "debtPayments": [ { "name": "Credit card", "amount": 50.00 } ],
        "transfers": [ { "from": "Checking", "to": "Savings", "amount": 100.00 } ],
        "balances": [ { "name": "Credit card", "amount": 1840.00 } ],
        "notes": ["optional, one line"] }
    ],
    "balances": [ { "date": "2026-11-27", "debts": { "Credit card": 1840.00 } } ],
    "cash": [
      { "date": "2026-11-25", "at": "2026-11-25T12:40:00Z", "cash": 912.40,
        "accounts": [ { "name": "Checking", "amount": 862.40, "at": "2026-11-25T12:40:00Z" }, { "name": "Cash", "amount": 50.00 } ],
        "transfers": [],
        "held": [ { "name": "Phone", "amount": 85.00, "due": "2026-11-26" }, { "name": "Gas until payday", "amount": 40.00 } ],
        "free": 787.40,
        "note": "optional, one line" }
    ]
  },
  "weights": [ { "date": "2026-11-27", "lb": 188.4 } ],
  "workouts": [],
  "eaten": [ { "id": "grok-2026-11-27-shake", "date": "2026-11-27", "name": "Protein shake", "amount": 1, "unit": "scoop", "slot": "snack", "macros": { "kcal": 120, "protein": 24, "carbs": 3, "fat": 1.5, "estimate": false } } ],
  "labs": [ { "date": "2026-12-04", "lab": "Quest", "markers": [
    { "name": "Vitamin D, 25-OH", "value": 24, "unit": "ng/mL", "range": "30-100", "low": 30, "high": 100 },
    { "name": "Ferritin", "value": 85, "unit": "ng/mL", "range": "38-380", "low": 38, "high": 380 }
  ] } ],
  "pets": [ { "id": "2026-11-27:the-dog:flea-tick", "date": "2026-11-27", "pet": "the-dog", "care": "flea-tick" },
            { "id": "2026-11-27:the-dog:weight", "date": "2026-11-27", "pet": "the-dog", "care": "weight", "lb": 31.5 } ],
  "supps": [ { "id": "2026-11-27:fish-oil", "date": "2026-11-27", "supp": "fish-oil" } ]
}
```

Each section's own rules are in its tab's part: `money.*` in 2, `eaten` in 9, `pets` in 11, `labs` and `supps` in 12. These hold for all of them:

- Keys match each entry: a money week by `weekEnding`, a weigh-in, balance or cash reading by `date`, a blood test by `date`, a workout by `id`, a food by `id` (make one up, e.g. `"grok-2026-11-27"`, with `date` and `sets` as in section 3).
- Send the same key again to correct an entry you added. To take one back, send `{ "weekEnding": "2026-11-27", "delete": true }`.
- Except for cash readings: if the owner already logged that day or week on the phone, **theirs is kept** and yours is skipped. Opus tells them.
- Same rules as everywhere: plain numbers, `null` or leave the line out when unknown, nothing invented.

---

## 5. The Growth page (`growth.json`, `"format": "opus-growth"`)

The Growth tab is Cassius's room. Only Cassius writes `growth.json`, with `"version": 2`. Since helper 1.12.0 Cassius has an Opus helper address of his own (since 1.14.0 the helper makes and keeps its key itself). It has every tool Grok's has, with everything saved there signed Cassius, plus `save_growth`: send `sections` (the top-level parts you change, each replaced whole, the rest kept) or `file` (the whole page), and a `change` line. It checks each part's kind, refuses unknown or retired parts, keeps a seal's first answer, sets `updated` and sends the owner a notification. Cassius may also commit the file directly. Grok's address has no `save_growth`, `update_growth` is gone from both, and Grok leaves anything about this page for Claude on the desk. The owner reads it, writes and logs, and what they do goes in `logs.json`. Keep `updated` current: the tab shows a dot when it changes.

```json
{
  "format": "opus-growth", "version": 2, "updated": "2026-11-23T10:30:00Z",
  "energy":  { "date": "2026-11-23", "text": "Exact words.", "from": "Speaker, where it's from", "why": "One line on why this line, today." },
  "lesson":  { "date": "2026-11-23", "form": "Letter", "title": "...", "minutes": 6, "body": "Markdown: paragraphs, - lists, > quotes, ### headings, **bold**, *italic*.",
               "question": "One question to answer in writing.", "takeaway": "One line to remember.", "why": "Why this, today.", "subject": "attention" },
  "recall":  { "date": "2026-11-23", "question": "Explain it again from memory.", "from": "lesson:2026-11-20" },
  "seal":    { "date": "2026-11-23", "question": "...", "answer": "Cassius's own answer, written now and never changed.", "opens": "2026-11-30" },
  "notes":   [ { "date": "2026-11-23", "text": "...", "on": "lesson:2026-11-23", "kind": "note" } ],
  "season":  { "n": 1, "question": "How does my mind work?", "start": "2026-11-23",
               "weeks": [ { "n": 1, "name": "Opening", "from": "2026-11-23", "to": "2026-11-29", "ground": "What this week covers.", "makes": null, "solid": false, "proof": null } ],
               "fallow": { "from": "2027-01-11", "to": "2027-01-17" }, "book": "happiness-hypothesis", "bookPart": "chapters 1 and 2" },
  "map":     { "regions": [ { "id": "attention", "name": "Attention", "about": "One line.", "solid": [ { "text": "...", "date": "...", "proof": "writing:2026-12-04:teachback", "faded": false } ], "thin": [], "opened": [] } ] },
  "portrait":{ "date": "2026-11-29", "season": 1, "sketch": true, "lines": [ { "text": "One line about who he is becoming.", "evidence": [ { "on": "glimpse:2026-11-25-ab12", "quote": "his own words" } ] } ] },
  "portraits": [],
  "creed":   { "lines": ["the Oct 28 lines"], "today": null, "written": "2026-10-28", "plain": [ { "i": 0, "text": "The line in his plain words.", "date": "2026-11-28" } ] },
  "lexicon": [ { "word": "salience", "meaning": "What makes a thing stand out.", "taught": "2026-12-01" } ],
  "gilded":  [ { "date": "2026-12-02", "text": "A sentence of his, quoted exactly.", "on": "writing:2026-12-02:lesson" } ],
  "constellations": [ { "id": "for-mom", "name": "For Mom", "about": "What these moments share.", "glimpses": ["2026-11-25-ab12"] } ],
  "reading": [ { "id": "enchiridion", "title": "Enchiridion", "author": "Epictetus", "status": "reading", "pages": 60, "shelf": "foundation", "verdict": "Honest one line.", "why": "Why this book.", "words": null } ],
  "made":    [ { "id": "owners-manual", "title": "Owner's Manual", "kind": "Booklet", "season": 1, "date": "2027-01-03", "text": "Markdown.", "then": "writing:2026-11-23:lesson" } ],
  "lessons": [], "prompt": null, "prompts": []
}
```

The page, top to bottom: the Lamp, Before class (and Back again), the Seal, From Cassius, the Season, the Map, the Scroll, Glimpses, the Portrait with the creed, the Library, Made. A section with nothing in it either says plainly what will come, or stays out. Never fill a section to make it look full.

- **energy** is the Lamp: one real line, worded exactly, its speaker named in `from` with where it's from. `why` shows when he taps the Lamp. If he kept the same line before (logs `kept`), the tap says so, so bringing a kept line back on a hard day is a gift, not a repeat. Press and hold keeps it (logs `kept`, id `lamp:<date>`).
- **lesson** is today's sitting, ready by 11:45. `form` names the kind of day (Letter, Lesson, Teach-back, Workshop, Walk, Tribunal, Seal...). The form decides where his answer is filed in logs `writing`: `kind` `teachback` for Teach-back, `workshop` for Workshop, `walk` for Walk, `lesson` for everything else, with `prompt` set to your `question`. When a new sitting comes, move the old one into `lessons` yourself (newest first is fine; keep about 120).
- **recall** is "Back again": a question from an earlier sitting, explained from memory. Answers are `kind` `recall`. Once answered on an earlier day it hides until you set a new one.
- **seal**: you write your own answer to a question and lock it. It opens on `opens` or as soon as he answers (logs `writing` `kind` `seal`), whichever is first. Never change `answer` after you've set it; that is the point.
- **notes** `kind` is `note` (default), `letter` (folded paper, opens to read; give it a `title`) or `story` (a piece of your own life; these also collect under your coin at the top). `on` ties a note to one thing: `lesson:`, `recall:`, `teachback:`, `workshop:`, `walk:`, `seal:` plus a date, `writing:<date>` for free writing, `glimpse:<id>`, `book:<id>`, `made:<id>`. A note with no `on` shows under From Cassius for 14 days. New notes carry a gold dot.
- **season**: one question, seven weeks and a fallow week. A week turns gold (`solid: true`) only when he has explained its ground start to finish; set `proof` to that writing as `writing:<date>:<kind>`. `makes` names what a making week produces; the Made shelf promises it until it exists. `book` is a `reading` id.
- **map** has eight regions. Mark ground `solid` when he explained it, `thin` when he half has it, `opened` when a sitting first touched it. If he can't explain a solid thing again on a later recall, set `faded: true` (it shows grey, never red). Only what he wrote or said lights the map.
- **portrait**: the first sketch comes after the first week. Every line needs evidence: a glimpse id, a writing (`writing:<date>:<kind>`) or something he said (`talk:<date>`), with a short quote of his own words. Move the old one into `portraits` when you redraw it.
- **creed**: `lines` stay the Oct 28 lines. Each Saturday Workshop he puts one or two in plain words; add them to `plain` with `i` (the line's number from 0). The new words show over the old.
- **lexicon**: a word you teach. It turns gold by itself the first time he uses it in his own writing on or after `taught`, without the prompt containing it. Teach sparingly.
- **gilded**: a sentence of his that was genuinely good, quoted exactly. Its day on the Scroll gets a gold mark. Rare, or it means nothing.
- **constellations** join Glimpses that belong together. Name one only when the pattern is real, and say in `about` what they share. Glimpses are his (logs `glimpses`, `{ id, date, line, who, at }`); never ask him for one. You may ask once in conversation whether a moment he mentions should be a Glimpse, and at most once a week on the Sunday Walk.
- **reading** `shelf` is `foundation` (read slowly with you), `workbench` (tools), `tribunal` (claims to test) or `fire` (fiction, for the love of it). `verdict` is your honest one line. `words` is the book's real word count, only when you have checked it; the Scroll marks the day his total passes it. His pages are in logs `reading`, and lines he copies from a book go to logs `kept` with id `line:<...>`.
- **made** is what he made: `text` is the thing itself, `then` points to the writing where it started.
- **prompt** and **prompts** feed the writing sheet on the Today tab, as before.
- `ledger` and `subjects` are retired; leave them out.
- Change the creed `lines` and the reading list only after talking it through with him. Never invent facts about him. Nothing on this page draws on his job.

---

Estimated 1-rep max uses Epley: weight × (1 + reps / 30).

## 6. The desk (`desk.json`, `"format": "opus-desk"`)

Claude builds and maintains the Opus app itself. You can change the plan, the outbox and the Growth page, but not the app. When something needs the app, leave a note on the desk with `leave_note`:

- something in Opus looks wrong, broken or confusing
- the owner asks for a feature, screen, field or kind of entry Opus doesn't have
- you need a place to save something and no section fits
- a question about how Opus reads a file

Read the desk first (`read_opus_file` file `desk`) so you don't repeat an open note, and read it at the start of a conversation to see Claude's replies. Claude reads it whenever it works on Opus, answers on the desk, and asks the owner before building anything. The owner sees open notes in Opus (Settings › Desk), so a note that needs them reaches them too. When a note is settled, close it (`leave_note` with `close`). Never put passwords, tokens or account numbers in a note.

```json
{ "format": "opus-desk", "version": 1, "updated": "2026-11-19T22:30:00Z",
  "notes": [
    { "id": "grok-mhx2k1", "from": "grok", "at": "2026-11-19T22:30:00Z", "about": "app", "text": "The owner wants a sleep tracker.", "re": null, "status": "answered" },
    { "id": "claude-mhx9a0", "from": "claude", "at": "2026-11-20T01:00:00Z", "about": "app", "text": "Asked the owner; building it this week.", "re": "grok-mhx2k1", "status": "open" } ] }
```

`from` is grok, cassius or claude. `status` is open, answered (Claude replied) or done. `re` is the note being answered.

## 7. The shared memory (`memory.md`)

The owner wants you and Claude to know the same things about them. Everything you know about the owner that would help either of you help them goes in `memory.md`, one fact per line, under a heading: About, Work, Training, Food, Health, Money, Home, Pets, People, Goals, Preferences, Other (a new short heading is fine).

- Save with `update_memory` (`section`, then `add`, `replace` or `remove`). The helper adds who wrote each line and the date: `- Trains before work on weekdays (grok, 2026-11-19)`.
- Write facts the owner told you or showed you, in plain words. Mark a guess as one ("seems to prefer…"). Keep each fact to one line.
- When a fact changes, remove the old line and add the new one, so the memory stays current rather than growing.
- Read it at the start of a conversation (`read_opus_file` file `memory`), so you know what Claude added.
- Never put passwords, sign-in codes, card, bank or account numbers, or ID numbers in it. The helper refuses lines that look like them.
- Claude reads it whenever it works on Opus and writes to it the same way. The owner sees it in Opus (Settings › Shared memory).

## 8. WHOOP (`whoop.json`, `"format": "opus-whoop"`)

The Opus helper pulls the owner's WHOOP data itself (WHOOP's official API), hourly from 4 AM to noon and every three hours after, and right away when WHOOP says something changed. Nobody else writes this file. Read it with `read_opus_file` file `whoop` when the owner's sleep, recovery or training load matters.

```json
{ "format": "opus-whoop", "version": 1, "connected": true, "pulled": "2026-11-23T10:05:00Z", "problem": null,
  "days": { "2026-11-23": {
    "recovery": { "scored": true, "calibrating": false, "score": 64, "hrv": 52, "rhr": 54, "spo2": 96.1, "skinTemp": 33.6 },
    "sleep": { "start": "...", "end": "...", "scored": true, "inBed": 452, "asleep": 418, "deep": 92, "rem": 101, "light": 225, "awake": 34, "disturbances": 9, "performance": 85, "efficiency": 92, "consistency": 71, "need": 490, "respiratory": 15.2 },
    "day": { "scored": true, "open": true, "strain": 11.4, "kcal": 2610, "avgHr": 71, "maxHr": 158 },
    "workouts": [ { "sport": "weightlifting", "start": "...", "end": "...", "minutes": 58, "strain": 8.1, "kcal": 311, "avgHr": 112, "maxHr": 160, "zones": [1, 20, 15, 5, 0, 0] } ] } } }
```
- A day is the owner's local date. Sleep and recovery belong to the day the owner woke up; the day's strain and calories to that same day (`open: true` while WHOOP's day is still running, so `kcal` is so far); a workout to the day it started. Sleep figures are minutes. Naps are left out.
- Recovery bands, WHOOP's own: green 67 and up, yellow 34 to 66, red 33 and under. On a red day Opus suggests a lighter session (drop the last set of each lift, stop 2 to 3 reps short) or moving it a day.
- Opus shows it on Today (last night), Train (what today's recovery means), Food (calories burned so far) and the weekly review (the week's averages). It keeps 60 days.
- Nothing here is a diagnosis. Never draw health conclusions from it; say what the numbers are and suggest the owner ask a doctor about anything that worries them.

---

## 9. Food

### The plan's `food`
```json
{
  "goal": { "start": 191, "target": 170, "unit": "lb" },
  "budgetPerWeek": { "low": 100, "high": 150 },
  "prepDay": "sun", "prepTime": "12:00",
  "days": ["mon", "tue", "wed", "thu", "fri"],
  "rules": ["Workday lunch is eaten cold."],
  "sections": ["Produce", "Meat", "Dairy & eggs", "Bakery", "Pantry", "Frozen", "Other"],
  "rotation": { "start": "2026-11-22", "weeks": [
    { "name": "Week A", "breakfast": "eggs-yogurt", "lunch": "chicken-rice", "snack": "meat-stick", "dinner": "beef-chili" }
  ]},
  "meals": {
    "chicken-rice": {
      "name": "Chicken rice bowl", "slot": "lunch",
      "how": "one line on what it is",
      "serving": "6 oz cooked chicken thigh, 1 cup rice, 1 cup broccoli",
      "macros": { "kcal": 580, "protein": 49, "carbs": 53, "fat": 17, "estimate": true },
      "parts": [
        { "name": "Chicken thigh, cooked", "amount": 170, "unit": "g", "macros": { "kcal": 354, "protein": 42, "carbs": 0, "fat": 19, "estimate": true },
          "micros": { "fiber": 0, "sodium": 150, "potassium": 430, "calcium": 15, "iron": 1.6, "magnesium": 40, "zinc": 3.4, "vitA": 30, "vitC": 0, "vitD": 0.3, "b12": 0.8, "folate": 10, "estimate": true } },
        { "name": "Rice, cooked", "amount": 1, "unit": "cup", "macros": { "kcal": 205, "protein": 4, "carbs": 45, "fat": 0.4, "estimate": true } },
        { "name": "Broccoli", "amount": 1, "unit": "cup", "macros": { "kcal": 31, "protein": 2.6, "carbs": 6, "fat": 0.3, "estimate": true } }
      ],
      "prep": ["prep step", "prep step"],
      "ingredients": [ { "item": "Chicken thighs", "qty": "3 lb", "section": "Meat" } ]
    }
  },
  "library": [
    { "name": "Greek yogurt cup", "amount": 1, "unit": "cup", "macros": { "kcal": 140, "protein": 15, "carbs": 10, "fat": 4, "estimate": false } }
  ]
}
```
- `days` (optional) lists the days the meal plan covers. The other days are **off days**: no planned meals, and Today shows *Log what you eat* instead. Give the meal items in `routine` the same `days`, and size `prep` and `ingredients` for that many servings (five for Monday to Friday). Food the owner logs on off days is in logs `eaten` like any extra. Leave `days` out to plan every day.
- When the owner adds food, Opus searches their own foods, then the free USDA FoodData Central database, then Open Food Facts for brands, and fills in macros, vitamins and minerals for the amount picked. What they log arrives in logs `eaten` with those numbers; nothing for you to do.
- The same meals are eaten all week. Week 1 of the rotation begins the Sunday of `rotation.start`, then the weeks repeat in order.
- **Ingredient amounts are for the whole week** (one batch). The grocery list merges the same `item` across meals and groups by `section` in `sections` order.
- Every meal id used in `rotation.weeks` must exist in `meals`.
- **`macros` are per serving** (one serving as eaten, described in `serving`): `kcal`, then `protein`, `carbs`, `fat` in grams. Set `"estimate": true` when the numbers come from standard nutrition values, `false` when they come from the owner's labels. Use `null` for anything unknown. The app adds up the meals on Today and shows how much has been eaten so far. When you change a meal's ingredients or portion, update its `serving` and `macros` too.
- **`parts`** are the pieces of one serving, so the owner can tick off only what was eaten (just the banana) or change an amount (150 g of chicken, not 200). Each part has `name`, `amount` (a number), `unit` (`"g"`, `"cup"`, `"tbsp"`, or `""` for a count like 4 eggs) and `macros` **for that amount**. When every part has macros, the meal's macros are their sum, so keep `macros` equal to that sum. Keep part names stable: what was eaten is logged by part name. When you change a meal, change its `parts`, `serving`, `macros`, `ingredients` and `prep` together, and save the whole `food` section (or `food.meals`) with `update_plan_section`.
- **`micros`** (optional, on a part or a saved food) are the vitamins and minerals **for that amount**, from standard nutrition values (USDA FoodData Central), with `"estimate": true`. The keys and units are fixed: `fiber` g, `sodium` mg, `potassium` mg, `calcium` mg, `iron` mg, `magnesium` mg, `zinc` mg, `vitA` µg RAE, `vitC` mg, `vitD` µg, `b12` µg, `folate` µg DFE. Any other key is refused. Use `null` for a nutrient you don't know. Sodium leaves out salt and seasoning added while cooking. Opus adds them up on Food › Vitamins & minerals and names every food that has no `micros`, so when you add or change a meal or a saved food, give each part its `micros` too.
- **`library`** is the owner's saved foods: things the owner eats outside the plan (a yogurt cup, a protein bar). Each has `name`, `amount`, `unit` and `macros` for that amount. They show as one-tap choices in Food › Add food, and Opus scales the macros when the amount changes. Add to it when the owner mentions a food they eat often; they can add to it on the phone too.

### Food in your outbox (`eaten`)

- **Food the owner tells you they ate (`eaten`)** shows on Food › Today as something extra and counts in the day's totals. Give each a made-up `id` (e.g. `"grok-2026-11-27-shake"`), `date` and `name`; add `amount`, `unit`, `slot` and `macros` when you know them (`null` when you don't). If it is a planned meal eaten as planned, don't log it here; the owner ticks it on the phone.

---

## 10. Training

### The plan's `training`
```json
{
  "schedule": { "tue": "lower-a", "thu": "upper-a", "sat": "lower-b", "sun": "upper-b" },
  "rest": { "compound": 180, "accessory": 120, "isolation": 75, "conditioning": 60 },
  "bar": 45,
  "plates": [45, 35, 25, 10, 5, 2.5],
  "dumbbells": [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 52.5, 55, 60],
  "increments": { "barbell-lower": 10, "barbell-upper": 5, "machine": 10, "cable": 5 },
  "exercises": { "back-squat": { "name": "Back squat", "type": "compound", "load": "barbell-lower" } },
  "workouts": {
    "lower-a": {
      "name": "Lower A", "focus": "Squat strength",
      "warmup": ["..."], "cooldown": ["..."],
      "blocks": [ { "ex": "back-squat", "sets": 4, "reps": [6, 8], "start": 230 } ],
      "conditioning": { "name": "Bike intervals", "detail": "8 rounds: 20 s hard, 40 s easy", "minutes": 8, "rounds": 8, "work": 20, "rest": 40 }
    }
  }
}
```
- `type` sets the rest timer: `compound` (longest), `accessory`, `isolation` (shortest), `conditioning`.
- `load` sets how weight goes up: `barbell-lower` (+10 lb), `barbell-upper` (+5), `dumbbell` (next size in `dumbbells`), `machine`, `cable`, `bodyweight` (adds reps).
- `reps` is `[low, high]`. Progression is double progression: when every set reaches `high` at a weight, the next session suggests the next weight at `low` reps. Two sessions in a row below `low` suggests about 10% less.
- `start` is the first-session weight, or `null` if unknown.
- Optional on an exercise or a block: `cue` (one coaching line shown under the exercise in the logger; a block's cue wins), `perSide` on a block or `repsNote` on an exercise (e.g. `"per leg"`, shown after the reps), and `optional: true` on a block (marked "Optional · first to cut" and left out of the set count unless started).
- `rounds`, `work`, `rest` (seconds) on conditioning turn on the interval timer.
- `base` on an exercise (a number, lb) is what a plate-loaded machine weighs with no plates on it. It turns on plate math for that exercise in the logger: weights are logged as the total, and Opus shows the plates per side. Barbell lifts use `bar` and need no `base`.
- Exercises the owner adds in the logger are saved into `exercises` with an id made from the name (e.g. `suitcase-march`). Keep them.

Workouts and weigh-ins the owner tells you about go in the outbox `workouts` and `weights` (section 4).

---

## 11. Home and pets

### The plan's `home`
`{ "id", "title", "area", "days", "monthDay", "part", "time", "note", "pet" }`. Use `days` (same rules as routine) or `monthDay` (1–28) for monthly jobs. Items show on Today only on the days they are due. `pet` (optional) ties a daily job to a pet, by its id or a list of ids (`"pet": ["dog-id", "cat-id"]` for feeding both); the job then shows on that pet's card with how many days this week it was done.

### `home.pets`
Each pet gets its own section on Home and a profile. Everything except `id` and `name` may be `null` until it is known.
```json
"pets": [
  { "id": "the-dog", "name": "Rex", "kind": "dog", "breed": "Beagle", "sex": "male",
    "born": null, "age": 4, "ageAsOf": "2026-11-16", "weightLb": 30,
    "food": null, "amount": null,
    "feeding": [ { "who": "me", "when": "in the morning" }, { "who": "Dad", "when": "around 2 PM" } ],
    "vet": { "name": null, "phone": null },
    "care": [ { "id": "flea-tick", "title": "Flea and tick", "every": { "n": 1, "unit": "month" } },
              { "id": "nails", "title": "Nails", "every": null, "part": "evening" } ],
    "notes": ["one line each"] }
]
```
- `kind` is `dog`, `cat` or `other`. `born` (a date) beats `age`; with only `age`, `ageAsOf` is the day it was true, so Opus can count up. `weightLb` is the starting weight; later weigh-ins go in the outbox `pets` with care `"weight"`.
- `feeding[].who` is `"me"` for the owner, otherwise a name. `food` is the brand and kind; `amount` is per meal (text, e.g. "1½ cups").
- `care` is anything done every so often. `every` is `{ "n", "unit" }` with unit `day`, `week` or `month`, or `null` when the owner hasn't said. Once a care job is logged and has `every`, Opus shows it on Today when it comes due (and keeps it there, marked overdue, until it is done). Care ids `weight` and `vet` are reserved. Keep each care `id` the same forever; the history is filed under it.
- The profile lists what is still unknown ("Not known yet: …"). Fill those from the owner's own words, never by guessing.

### Pet care in your outbox (`pets`)

- **Pet care (`pets`)**: `id` is exactly `date:pet:care`, using ids from `home.pets`. Weigh-ins use care `"weight"` with `lb`; vet visits use `"vet"` with a one-line `note`. If the owner mentions a care job the pet doesn't have yet, add it to that pet's `care` in the plan first.

---

## 12. Health

### The plan's `health`
```json
"health": { "reference": "men-31-50" }
```
- `reference` is which daily amounts Food › Vitamins & minerals compares against: `"men-19-30"`, `"men-31-50"`, `"women-19-30"` or `"women-31-50"` (US Dietary Reference Intakes). The owner picks it on the phone the first time. Never set or change it yourself unless the owner tells you which.
- Blood test results are not in the plan: they go in the outbox `labs` (below) and live in `logs.json` `labs`.
- `supplements` is what the owner takes, ticked on Today and kept on Food › Supplements:
```json
"supplements": [ { "id": "fish-oil", "name": "Fish oil", "dose": "2 capsules", "part": "morning", "time": null,
                   "days": "all", "withFood": true, "note": null, "since": "2026-11-18", "supply": { "left": 90, "asOf": "2026-11-18", "perDose": 2 } } ]
```
  `part` is `morning`, `workday` or `evening` (all of one part share one row on Today). `days` follows the routine rules. `supply` is optional: how many were on hand on `asOf` and how many one dose uses; Opus counts down from the days taken after `asOf`, warns about ten days before it runs out and adds it to the grocery list. `since` is the day they started it (Opus counts how often it was taken from then). Set `"active": false` to pause one without losing its history. Keep each `id` the same forever. Add only what the owner says they take; never suggest one, and never set a dose they didn't give.

### Blood tests and supplements in your outbox (`labs`, `supps`)

- **Blood tests (`labs`)**: when the owner sends a lab report or a photo of one, copy every result exactly as printed: `name`, `value` (a number), `unit`, and the lab's reference `range` as printed, with its numbers in `low` and `high` (leave one out for a range like "<100" or ">40"). `date` is the date the blood was drawn. One entry per test date; send the same `date` again to correct it. Read every number twice; if one is hard to read, leave that marker out and ask. Don't interpret, diagnose or suggest treatment. If a result is outside the lab's range, say only that, and that it is worth raising with their doctor. Opus shows the results under Food › Vitamins & minerals › Blood tests, with trends, beside the food estimates.
- **Supplements (`supps`)**: `id` is exactly `date:supp`, using ids from `health.supplements`. Log one only when the owner says they took it.

---

## 13. Good requests to expect

- "Sync Opus." Do the steps under *Keeping Opus current*, then report what you saved and what only the owner can answer.
- "Swap Week B dinner for something with ground beef." With the helper: read section `food`, change it, save with `update_plan_section` section `food`. Edit `food.meals` (with the new meal's `parts`, `serving`, `macros`, `ingredients` and `prep`) and `food.rotation`, keep ingredient amounts weekly.
- "Breakfast is 3 eggs now, not 4." Change that meal's egg part (`amount` and its `macros`), then its `serving` and `macros` sum, and the weekly egg `qty` in `ingredients`.
- "I had a protein shake after the gym." Add it to the outbox `eaten`. If they have it often, also add it to `food.library`.
- "Add my blood test to Opus" (with a photo or PDF of the report). Copy every result into the outbox `labs` as described in section 12, then list what you saved and anything you couldn't read.
- "How are my vitamins looking?" Add up `micros` for what they ate (planned meals ticked, scaled by `eaten` parts, plus extras) and compare with the daily amounts for `health.reference`; name the foods without `micros`. Put any blood results beside them. No diagnosis; anything outside the lab's range is for their doctor.
- "I gave the dog the flea pill." Add a `pets` entry for today with that care id. If its `every` is `null`, ask how often it's due and save that to the pet's `care`.
- "The cat weighs 11 pounds now." Add a `pets` entry with care `"weight"` and `lb`.
- "I started taking magnesium at night." Add it to `health.supplements` with the details they gave (`null` for the rest) and ask for the dose if they didn't say.
- "What did I actually eat this week?" Read `checks` and `eaten` since Sunday; planned meals ticked with no `eaten` entry were eaten as planned.
- "Move Upper A to Wednesday." Change `training.schedule`.
- "Bump my protein at lunch." Change the lunch meal's ingredients and portion, then its `serving` and `macros`.
- "I can't get to 8 on squats; make the range 5 to 7." Change that block's `reps`.
- "Add 'Change the furnace filter' on the 1st of each month." Add a home item with `monthDay: 1`.
- "Look at my last two weeks and tell me one change." Read `logs.json` (or the summary or backup); answer in a sentence or two, and only change the plan if asked.
- "Update my free cash." Read the accounts, then add today's `money.cash` entry with `cash`, `held` and `free`.
- "Log my money for this week." Read the week from the owner's accounts and add it to `grok.json` under `money.weeks`.
- "What's still blank in my plan?" List every `null` in `plan.json` by where it is, in plain words.
