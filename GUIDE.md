# Opus guide for AI helpers (Claude, Grok)

Opus is a personal phone app (a home-screen web app). It reads **one plan file** and keeps **logs** on the phone. You help by editing the plan, reading the logs, and adding entries such as a weekly money block. Everything is plain JSON or plain text.

## Where the data lives

The owner keeps Opus data in a **private GitHub repo** (usually `opus-data`). Opus pulls it every time it opens and pushes the phone's logs back. Four files sit at the top of the repo:

| file | who writes it | what it is |
|---|---|---|
| `plan.json` | **you** and the app | the plan (section 1). Edit it in place. |
| `logs.json` | **only the app** | everything logged on the phone (section 3). Read it, never edit it. |
| `grok.json` | **only you** | your outbox: entries you log for the owner (section 4). |
| `GUIDE.md` | the app | this guide. |

If the owner hasn't set up the repo, or your connector can't write files, use the paste route instead: reply with the whole file in one code block and the owner pastes it into Opus (Settings › Plan › Import plan, or Money › Weekly money import).

## The ground rules

1. **Never invent numbers.** If a weight, balance, rate, bill amount or paycheck is unknown, use `null`. The app shows a blank the owner fills in. Fill a number only from what the owner told you or from their accounts.
2. **Keep `plan.json` whole and valid.** It is one JSON object with `"format": "opus-plan"`. Change only what was asked or clearly needs it, and leave everything else exactly as it is. Opus checks the file before it uses it. If it is broken, Opus keeps the plan it had and shows the owner the first problem, and nothing is lost.
3. **Keep ids stable.** Logs point at ids (`back-squat`, `breakfast`, `trash`). Rename the `name` or `title`, never the id, unless you mean to start fresh.
4. **Set `"updated"`** to today's date (`YYYY-MM-DD`) when you change the plan.
5. **Never touch logs you didn't write.** Don't edit or delete `logs.json`. To log something for the owner, put it in `grok.json`.
6. **Say what you changed**, in a line, after each change: which file and what.
7. Times are 24-hour `"HH:MM"`. Days are `sun mon tue wed thu fri sat`.

## How changes meet

- The owner may change the plan on the phone while you change it in GitHub (for example a debt balance, a meal's macros, or an exercise added in the logger). Opus merges both, part by part. When the same value was changed in both places, **your copy in GitHub wins**, and the owner can undo the whole update from Settings › Sync.
- Logs only grow from a sync. A log leaves only when the owner removes it on the phone.
- Small partial changes are fine: edit just the meal, the debt or the workout you mean, in place. You never need to resend the whole plan when you write to GitHub.

## How the owner moves files without sync

- **Plan to you:** Settings › Plan › *Copy plan*, then paste to you.
- **Plan back:** Settings › Plan › *Import plan*, paste your JSON, *Check plan*, *Use this plan*. Return the whole plan in one code block for this.
- **Logs to you:** Settings › Your data › *Copy a 2-week summary* (plain text), or *Export backup* (full JSON, section 3).
- **Money each Friday:** Money › Weekly money import, paste the `OPUS MONEY WEEK` block (section 2).

---

## 1. Plan file (`"format": "opus-plan"`, `"version": 1`)

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

### food
```json
{
  "goal": { "start": 191, "target": 170, "unit": "lb" },
  "budgetPerWeek": { "low": 100, "high": 150 },
  "prepDay": "sun", "prepTime": "12:00",
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
      "prep": ["prep step", "prep step"],
      "ingredients": [ { "item": "Chicken thighs", "qty": "3 lb", "section": "Meat" } ]
    }
  }
}
```
- The same meals are eaten all week. Week 1 of the rotation begins the Sunday of `rotation.start`, then the weeks repeat in order.
- **Ingredient amounts are for the whole week** (one batch). The grocery list merges the same `item` across meals and groups by `section` in `sections` order.
- Every meal id used in `rotation.weeks` must exist in `meals`.
- **`macros` are per serving** (one serving as eaten, described in `serving`): `kcal`, then `protein`, `carbs`, `fat` in grams. Set `"estimate": true` when the numbers come from standard nutrition values, `false` when they come from the owner's labels. Use `null` for anything unknown. The app adds up the meals on Today and shows how much has been eaten so far. When you change a meal's ingredients or portion, update its `serving` and `macros` too.

### training
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
- Exercises the owner adds in the logger are saved into `exercises` with an id made from the name (e.g. `suitcase-march`). Keep them.

### money
```json
{
  "currency": "USD",
  "takeHomePerWeek": 650,
  "countOvertime": false,
  "payday": "fri", "checkInDay": "fri", "checkInTime": "18:30",
  "plannedDebtPerWeek": null,
  "bills": [ { "name": "Car insurance", "amount": 151, "every": "month" } ],
  "debts": [ { "name": "Credit card", "balance": null, "apr": null, "minMonthly": null } ]
}
```
- `debts` are in **payoff order**. The first with a balance above zero is the focus.
- `every` is `week`, `month` or `year`.
- Free cash a week = take-home − bills (weekly share) − `plannedDebtPerWeek` − normal spending (average of the last 4 imported weeks; the grocery budget until then).
- Debt-free date: each month pays every minimum, then the rest of the debt money goes to the first debt in order. Interest uses `apr` when set.

### home
`{ "id", "title", "area", "days", "monthDay", "part", "time", "note" }`. Use `days` (same rules as routine) or `monthDay` (1–28) for monthly jobs. Items show on Today only on the days they are due.

### mind and review
```json
"mind":   { "writing": { "goal": "I write clearly", "sentences": 5, "prompts": ["..."] } },
"review": { "day": "sun", "time": "19:30", "questions": ["What worked?", "What slipped?", "One change for next week"] }
```

---

## 2. Weekly money block (paste route, every Friday)

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
- A paycheck above the usual take-home is treated as overtime and not counted in the plan.
- JSON also works: `{ "format": "opus-money-week", "week_ending": "...", "paycheck": 650, "spent": [{ "category": "groceries", "amount": 124.5 }], "bills": [{ "name": "...", "amount": 0 }], "debt_payments": [...], "balances": [{ "name": "...", "balance": 0 }] }`

The app previews the block and lists any problems before saving.

---

## 3. Logs (`logs.json`, `"format": "opus-logs"`) and backups (`"format": "opus-data"`)

`logs.json` in the repo holds the keys below (no `plan`, `active` or `settings`). A backup file (Settings › Your data › Export backup) holds all of them plus the plan. Both are read-only for you.

| key | shape |
|---|---|
| `plan` | the plan file above (backup only) |
| `checks` | `{ "2026-11-24": ["breakfast", "home:trash", "workout", ...] }` items checked off each day |
| `workouts` | `[{ "id", "workout": "lower-a", "name", "date", "started", "finished", "sets": [{ "ex", "weight", "reps", "at", "pr" }], "conditioning": true, "warmup": [...], "cooldown": [...], "note": "..." }]` (`warmup` and `cooldown` list the items ticked; `pr` true = new best estimated 1-rep max; `workout` is `"free"` for a session built on the spot; `catchUp` true = logged afterwards, so it has no real duration) |
| `active` | a workout in progress, or `null` (backup only) |
| `weights` | `[{ "date", "lb" }]` |
| `money.weeks` | saved weekly money blocks: `{ "weekEnding", "paycheck", "spent": [{ "cat", "amount" }], "bills": [{ "name", "amount" }], "debtPayments": [{ "name", "amount" }], "balances": [{ "name", "amount" }], "notes": [] }` |
| `money.balances` | `[{ "date", "debts": { "Credit card": 1840 } }]` balance history |
| `groceries` | `{ "<week-start date>": ["Eggs", ...] }` items checked while shopping |
| `prep` | prep steps done per week |
| `reviews` | `[{ "weekOf", "worked", "slipped", "change", "saved" }]` |
| `writing` | `[{ "date", "text", "words", "sentences", "prompt" }]` |
| `deleted` | `{ "workouts": { "<id>": "<when>" } }` workouts the owner deleted, so they stay deleted |
| `settings` | tab order, hidden tabs, rest timer overrides, sound, last backup (backup only) |

Entries that came from you carry `"by": "grok"`.

---

## 4. Your outbox (`grok.json`, `"format": "opus-grok"`)

Put only new or corrected entries here. You may replace the whole file each time; Opus copies each entry into the logs once and keeps it, even after you take it out of this file.

```json
{
  "format": "opus-grok",
  "version": 1,
  "updated": "2026-11-27",
  "money": {
    "weeks": [
      { "weekEnding": "2026-11-27", "paycheck": 650.00,
        "spent": [ { "cat": "groceries", "amount": 124.50 }, { "cat": "gas", "amount": 48.00 } ],
        "bills": [ { "name": "Car insurance", "amount": 151.00 } ],
        "debtPayments": [ { "name": "Credit card", "amount": 50.00 } ],
        "balances": [ { "name": "Credit card", "amount": 1840.00 } ],
        "notes": ["optional, one line"] }
    ],
    "balances": [ { "date": "2026-11-27", "debts": { "Credit card": 1840.00 } } ]
  },
  "weights": [ { "date": "2026-11-27", "lb": 188.4 } ],
  "workouts": []
}
```
- Keys match each entry: a money week by `weekEnding`, a weigh-in or balance by `date`, a workout by `id` (make one up, e.g. `"grok-2026-11-27"`, with `date` and `sets` as in section 3).
- Send the same key again to correct an entry you added. To take one back, send `{ "weekEnding": "2026-11-27", "delete": true }`.
- If the owner already logged that day or week on the phone, **theirs is kept** and yours is skipped. Opus tells them.
- A money week's `balances` also update the matching debts' `balance` in the plan (names match `money.debts[].name`, case does not matter), just like a pasted money block.
- Same rules as everywhere: plain numbers, `null` or leave the line out when unknown, nothing invented.

---

Estimated 1-rep max uses Epley: weight × (1 + reps / 30).

## Good requests to expect

- "Swap Week B dinner for something with ground beef." Edit `food.meals` and `food.rotation`, keep ingredient amounts weekly.
- "Move Upper A to Wednesday." Change `training.schedule`.
- "Bump my protein at lunch." Change the lunch meal's ingredients and portion, then its `serving` and `macros`.
- "I can't get to 8 on squats; make the range 5 to 7." Change that block's `reps`.
- "Add 'Change the furnace filter' on the 1st of each month." Add a home item with `monthDay: 1`.
- "Look at my last two weeks and tell me one change." Read `logs.json` (or the summary or backup); answer in a sentence or two, and only change the plan if asked.
- "Log my money for this week." Read the week from the owner's accounts and add it to `grok.json` under `money.weeks`.
- "What's still blank in my plan?" List every `null` in `plan.json` by where it is, in plain words.
