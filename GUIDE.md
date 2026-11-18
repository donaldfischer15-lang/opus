# Opus guide for AI helpers (Claude, Grok)

Opus is a personal phone app (a home-screen web app). It reads **one plan file** and keeps **logs** on the phone. You help by editing the plan, reading the logs, and adding entries such as a weekly money block. Everything is plain JSON or plain text.

## Where the data lives

The owner keeps Opus data in a **private GitHub repo** (usually `opus-data`). Opus pulls it every time it opens and pushes the phone's logs back. These files sit in the repo:

| file | who writes it | what it is |
|---|---|---|
| `plan.json` | **you** and the app | the plan (section 1). Edit it in place. |
| `logs.json` | **only the app** | everything logged on the phone (section 3). Read it, never edit it. |
| `grok.json` | **only you** | your outbox: entries you log for the owner (section 4). |
| `growth.json` | **only the teacher** (Cassius) | the Growth page: today's words, the lesson, prompts, creed, reading, notes (section 5). The app only reads it. |
| `GUIDE.md` | the app | this guide. |
| `helper.json` | the Opus helper | which helper version is live (`{ "version", "since" }`). Opus warns the owner when it is behind. |
| `backups/opus-backup-YYYY-MM.json` | the app, once a month | a full backup (plan, logs and settings, `"format": "opus-data"`) from the first sync of that month. Never edit these. To restore one, the owner imports it in Settings › Your data › Import backup. |

### The Opus helper (the "opus" connector)

If you have the opus connector, use its tools; they check everything before saving and say exactly what was wrong if something isn't saved.

| tool | use it to |
|---|---|
| `read_opus_file` | read `guide`, `plan`, `logs`, `outbox` or `growth`. Long files come in parts of about 14,000 characters (the first line says "part 1 of N"; ask for the next with `part`). Read less with `section` (`"money"`, `"money.debts"`, `"training"`, logs `"workouts"`, guide `"4"`) and `since` (`"YYYY-MM-DD"`, list entries from that date on). |
| `update_plan_section` | change one part of the plan (`"money"`, `"money.debts"`, `"training.schedule"`…). Only that part is replaced, so edits the owner or Claude made elsewhere are safe. Read the part first and send it back whole. **Use this for almost every plan change.** |
| `save_plan` | replace the whole plan. Only when the change touches many parts; read every part first. |
| `add_to_outbox` | log entries for the owner (section 4). |
| `update_growth` | the Growth page (section 5; Cassius only). |

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
- a new home job or a change to one (plan `home`)
- a weigh-in, a meal or food eaten, a workout done, or today's cash (the outbox, section 4)
- blood test results, from a report or a photo of one (the outbox `labs`, section 4)

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
- The same meals are eaten all week. Week 1 of the rotation begins the Sunday of `rotation.start`, then the weeks repeat in order.
- **Ingredient amounts are for the whole week** (one batch). The grocery list merges the same `item` across meals and groups by `section` in `sections` order.
- Every meal id used in `rotation.weeks` must exist in `meals`.
- **`macros` are per serving** (one serving as eaten, described in `serving`): `kcal`, then `protein`, `carbs`, `fat` in grams. Set `"estimate": true` when the numbers come from standard nutrition values, `false` when they come from the owner's labels. Use `null` for anything unknown. The app adds up the meals on Today and shows how much has been eaten so far. When you change a meal's ingredients or portion, update its `serving` and `macros` too.
- **`parts`** are the pieces of one serving, so the owner can tick off only what was eaten (just the banana) or change an amount (150 g of chicken, not 200). Each part has `name`, `amount` (a number), `unit` (`"g"`, `"cup"`, `"tbsp"`, or `""` for a count like 4 eggs) and `macros` **for that amount**. When every part has macros, the meal's macros are their sum, so keep `macros` equal to that sum. Keep part names stable: what was eaten is logged by part name. When you change a meal, change its `parts`, `serving`, `macros`, `ingredients` and `prep` together, and save the whole `food` section (or `food.meals`) with `update_plan_section`.
- **`micros`** (optional, on a part or a saved food) are the vitamins and minerals **for that amount**, from standard nutrition values (USDA FoodData Central), with `"estimate": true`. The keys and units are fixed: `fiber` g, `sodium` mg, `potassium` mg, `calcium` mg, `iron` mg, `magnesium` mg, `zinc` mg, `vitA` µg RAE, `vitC` mg, `vitD` µg, `b12` µg, `folate` µg DFE. Any other key is refused. Use `null` for a nutrient you don't know. Sodium leaves out salt and seasoning added while cooking. Opus adds them up on Food › Vitamins & minerals and names every food that has no `micros`, so when you add or change a meal or a saved food, give each part its `micros` too.
- **`library`** is the owner's saved foods: things the owner eats outside the plan (a yogurt cup, a protein bar). Each has `name`, `amount`, `unit` and `macros` for that amount. They show as one-tap choices in Food › Add food, and Opus scales the macros when the amount changes. Add to it when the owner mentions a food they eat often; they can add to it on the phone too.

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

### health
```json
"health": { "reference": "men-31-50" }
```
- `reference` is which daily amounts Food › Vitamins & minerals compares against: `"men-19-30"`, `"men-31-50"`, `"women-19-30"` or `"women-31-50"` (US Dietary Reference Intakes). The owner picks it on the phone the first time. Never set or change it yourself unless the owner tells you which.
- Blood test results are not in the plan: they go in the outbox `labs` (section 4) and live in `logs.json` `labs`.

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
| `checks` | `{ "2026-11-24": ["breakfast", "home:trash", "workout", ...] }` items checked off each day. `"growth-lesson"` on a date = the owner marked that day's lesson as learned. |
| `workouts` | `[{ "id", "workout": "lower-a", "name", "date", "started", "finished", "sets": [{ "ex", "weight", "reps", "at", "pr" }], "conditioning": true, "warmup": [...], "cooldown": [...], "note": "..." }]` (`warmup` and `cooldown` list the items ticked; `pr` true = new best estimated 1-rep max; `workout` is `"free"` for a session built on the spot; `catchUp` true = logged afterwards, so it has no real duration) |
| `active` | a workout in progress, or `null` (backup only) |
| `weights` | `[{ "date", "lb" }]` |
| `money.weeks` | saved weekly money blocks: `{ "weekEnding", "paycheck", "spent": [{ "cat", "amount" }], "bills": [{ "name", "amount" }], "debtPayments": [{ "name", "amount" }], "balances": [{ "name", "amount" }], "notes": [] }` |
| `money.balances` | `[{ "date", "debts": { "Credit card": 1840 } }]` balance history |
| `money.cash` | `[{ "date", "at", "cash", "accounts": [{ "name", "amount" }], "held": [{ "name", "amount", "due" }], "free", "note" }]` Free cash readings, one per day: cash on hand, what is held back before payday, and what is left (`free`). The newest `at` wins, whoever made it. Entries with no `by` were entered by the owner. |
| `sync` | `{ "at", "app", "outbox": { "updated", "added", "changed", "removed", "kept": [...], "skipped": [...] } }` when Opus last synced (it writes this at least once on each day it's opened) and what it took from `grok.json` the last time that file changed. If `outbox.updated` matches the `updated` time in `grok.json`, Opus has picked up your latest entries. `kept` = entries where the owner's own entry won; `skipped` = entries Opus refused, with the reason. |
| `prefs` | `{ "restSeconds": { "<exercise id>": 150 }, "tabs": [...], "hiddenTabs": [...], "sound": true }` the owner's settings, for reference only |
| `groceries` | `{ "<week-start date>": ["Eggs", ...] }` items checked while shopping |
| `prep` | prep steps done per week |
| `reviews` | `[{ "weekOf", "worked", "slipped", "change", "saved" }]` |
| `writing` | `[{ "date", "text", "words", "sentences", "prompt", "kind" }]` (`"kind": "lesson"` = an answer to the lesson's question, and `prompt` is that question; no `kind` = the day's writing practice) |
| `reading` | `[{ "id", "page", "date", "done" }]` the owner's page in each book from `growth.json` `reading` (`done` true = finished) |
| `kept` | `[{ "date", "text", "from" }]` the Growth words the owner chose to keep |
| `eaten` | what was actually eaten, when it differs from the plan. **A planned meal:** `{ "id": "<date>:<routine item id>", "date", "item", "meal", "name", "parts": [{ "name", "unit", "planned", "ate", "macros" }], "macros", "at" }` (part of it was eaten, or more or less; `macros` is what was eaten), or the same with `"skipped": true` (not eaten). A planned meal that is ticked in `checks` with no entry here was eaten as planned. **Something extra:** `{ "id", "date", "extra": true, "name", "amount", "unit", "slot", "macros", "at" }` (`macros` may be `null`; `slot` is breakfast, lunch, snack or dinner). |
| `labs` | blood test results: `{ "date", "lab", "markers": [{ "name", "value", "unit", "range", "low", "high" }], "note", "at" }`, one entry per test date. `range` is the lab's reference range as printed; `low` and `high` are its numbers. A value below `low` or above `high` shows as outside the lab's range. |
| `deleted` | `{ "workouts": { "<id>": "<when>" }, "eaten": { "<id>": "<when>" }, "labs": { "<date>": "<when>" } }` workouts, food entries and blood tests the owner removed, so they stay removed |
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
| picked which daily amounts to compare against | `plan.json` `health.reference` |
| logged a workout or a set | `logs.json` `workouts` |
| weighed in | `logs.json` `weights` |
| entered cash on hand (Money › Free cash › Update it myself) | `logs.json` `money.cash` |
| did the weekly money check-in | `logs.json` `money.weeks` |
| updated a debt balance | `logs.json` `money.balances`, and the debt's `balance` in `plan.json` |
| changed money numbers, a bill, a debt, a meal, an exercise or a home job | `plan.json` |
| ticked groceries or prep | `logs.json` `groceries`, `prep` |
| wrote, answered a lesson, kept words, moved a bookmark | `logs.json` `writing`, `kept`, `reading` |
| did the weekly review | `logs.json` `reviews` |
| changed rest timers, tabs or sound | `logs.json` `prefs` |

---

## 4. Your outbox (`grok.json`, `"format": "opus-grok"`)

The outbox has exactly seven sections: **`money.cash`, `money.weeks`, `money.balances`, `weights`, `workouts`, `eaten`, `labs`**. Anything else is refused by name, and every refused entry is listed with the field that was wrong.

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
        "balances": [ { "name": "Credit card", "amount": 1840.00 } ],
        "notes": ["optional, one line"] }
    ],
    "balances": [ { "date": "2026-11-27", "debts": { "Credit card": 1840.00 } } ],
    "cash": [
      { "date": "2026-11-25", "at": "2026-11-25T12:40:00Z", "cash": 912.40,
        "accounts": [ { "name": "Checking", "amount": 862.40 }, { "name": "Cash", "amount": 50.00 } ],
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
  ] } ]
}
```
- **Free cash (`money.cash`)** is the big number at the top of Money: the cash the owner can use that isn't needed for bills or anything else before the next payday (`money.payday` in the plan).
  - `cash` is the total in the accounts they spend from (checking plus cash; not savings unless they say so). List each in `accounts`.
  - `held` is everything that has to come out before payday: bills due by then, planned debt payments, and money they set aside. Give each a `due` date when it has one.
  - `free` is `cash` minus everything in `held`. If you leave it out, Opus works it out.
  - `at` is when you read the accounts (ISO time). One entry per day: send the same `date` again to update it. The newest reading wins, even over one the owner typed in.
  - Update it whenever you look at their accounts, and at least once a day if you can.
- **Food the owner tells you they ate (`eaten`)** shows on Food › Today as something extra and counts in the day's totals. Give each a made-up `id` (e.g. `"grok-2026-11-27-shake"`), `date` and `name`; add `amount`, `unit`, `slot` and `macros` when you know them (`null` when you don't). If it is a planned meal eaten as planned, don't log it here; the owner ticks it on the phone.
- **Blood tests (`labs`)**: when the owner sends a lab report or a photo of one, copy every result exactly as printed: `name`, `value` (a number), `unit`, and the lab's reference `range` as printed, with its numbers in `low` and `high` (leave one out for a range like "<100" or ">40"). `date` is the date the blood was drawn. One entry per test date; send the same `date` again to correct it. Read every number twice; if one is hard to read, leave that marker out and ask. Don't interpret, diagnose or suggest treatment. If a result is outside the lab's range, say only that, and that it is worth raising with their doctor. Opus shows the results under Food › Vitamins & minerals › Blood tests, with trends, beside the food estimates.
- Keys match each entry: a money week by `weekEnding`, a weigh-in, balance or cash reading by `date`, a blood test by `date`, a workout by `id`, a food by `id` (make one up, e.g. `"grok-2026-11-27"`, with `date` and `sets` as in section 3).
- Send the same key again to correct an entry you added. To take one back, send `{ "weekEnding": "2026-11-27", "delete": true }`.
- Except for cash readings: if the owner already logged that day or week on the phone, **theirs is kept** and yours is skipped. Opus tells them.
- A money week's `balances` also update the matching debts' `balance` in the plan (names match `money.debts[].name`, case does not matter), just like a pasted money block.
- Same rules as everywhere: plain numbers, `null` or leave the line out when unknown, nothing invented.

---

## 5. The Growth page (`growth.json`, `"format": "opus-growth"`)

The Growth tab is the teacher's page. The teacher (Cassius) fills it in; the owner reads it, writes, and marks progress, which goes in `logs.json`. Through the Opus helper, save it with **`update_growth`**, sending only the sections you change. Read the current page with `read_opus_file` and `"file": "growth"`.

```json
{
  "format": "opus-growth", "version": 1, "updated": "2026-11-24T07:30:00Z",
  "energy":  { "text": "Start the hard thing small.", "from": null, "date": "2026-11-24" },
  "creed":   { "lines": ["I keep my word.", "I do the hard thing first."] },
  "lesson":  { "date": "2026-11-24", "subject": "Logic and argument", "title": "Claims need reasons", "minutes": 4,
               "body": "Paragraphs split by a blank line.\n\n- lists start with a dash\n\n> a quote starts with >\n\n**bold** and *italic* work.",
               "question": "One question for the owner to answer in writing." },
  "prompt":  { "date": "2026-11-24", "text": "Today's writing prompt." },
  "prompts": [ { "id": "door", "text": "A prompt for other days." } ],
  "subjects":[ { "id": "logic", "name": "Logic and argument", "now": "What makes an argument valid", "next": "Common fallacies" } ],
  "reading": [ { "id": "enchiridion", "title": "The Enchiridion", "author": "Epictetus", "status": "reading", "pages": 60, "why": "One line on why this book." } ],
  "lessons": [ { "date": "2026-11-23", "subject": "...", "title": "...", "body": "...", "question": "...", "takeaway": "One line to remember." } ],
  "notes":   [ { "date": "2026-11-24", "text": "An honest note on the owner's writing.", "on": "writing:2026-11-24" } ]
}
```
- **energy** sits at the top of the page: one short piece of positive energy for the day, motivational or just good. If it is a quote, `from` names who said it, and it must be real and worded right. Leave `from` null when the words are yours.
- **lesson** is today's lesson. When a new one arrives on a new date, the old one moves into `lessons` by itself. `minutes` is optional (the app works it out). `takeaway` is optional.
- **prompt** is today's writing prompt; it comes first in the owner's writing sheet on that date. `prompts` are for the other days.
- **reading** `status` is `reading`, `next` or `done`. The owner logs the page they're on (logs `reading`).
- **notes**: a note with `"on": "writing:<date>"` or `"on": "lesson:<date>"` shows under that piece of writing; a note with no `on` shows under *From Cassius*. Read the owner's writing in `logs.json` before you comment on it.
- Lists are matched by key: `prompts`, `subjects` and `reading` by `id`; `lessons` by `date`; `notes` by `date` and `on`. Same key again replaces an entry, `{ "id": "door", "delete": true }` removes one. The helper keeps the last 120 lessons and 60 notes.
- Change `creed`, `subjects` and `reading` only when you and the owner have talked it through. Never invent facts about the owner.

---

Estimated 1-rep max uses Epley: weight × (1 + reps / 30).

## Good requests to expect

- "Sync Opus." Do the steps under *Keeping Opus current*, then report what you saved and what only the owner can answer.
- "Swap Week B dinner for something with ground beef." With the helper: read section `food`, change it, save with `update_plan_section` section `food`. Edit `food.meals` (with the new meal's `parts`, `serving`, `macros`, `ingredients` and `prep`) and `food.rotation`, keep ingredient amounts weekly.
- "Breakfast is 3 eggs now, not 4." Change that meal's egg part (`amount` and its `macros`), then its `serving` and `macros` sum, and the weekly egg `qty` in `ingredients`.
- "I had a protein shake after the gym." Add it to the outbox `eaten`. If they have it often, also add it to `food.library`.
- "Add my blood test to Opus" (with a photo or PDF of the report). Copy every result into the outbox `labs` as described in section 4, then list what you saved and anything you couldn't read.
- "How are my vitamins looking?" Add up `micros` for what they ate (planned meals ticked, scaled by `eaten` parts, plus extras) and compare with the daily amounts for `health.reference`; name the foods without `micros`. Put any blood results beside them. No diagnosis; anything outside the lab's range is for their doctor.
- "What did I actually eat this week?" Read `checks` and `eaten` since Sunday; planned meals ticked with no `eaten` entry were eaten as planned.
- "Move Upper A to Wednesday." Change `training.schedule`.
- "Bump my protein at lunch." Change the lunch meal's ingredients and portion, then its `serving` and `macros`.
- "I can't get to 8 on squats; make the range 5 to 7." Change that block's `reps`.
- "Add 'Change the furnace filter' on the 1st of each month." Add a home item with `monthDay: 1`.
- "Look at my last two weeks and tell me one change." Read `logs.json` (or the summary or backup); answer in a sentence or two, and only change the plan if asked.
- "Update my free cash." Read the accounts, then add today's `money.cash` entry with `cash`, `held` and `free`.
- "Log my money for this week." Read the week from the owner's accounts and add it to `grok.json` under `money.weeks`.
- "What's still blank in my plan?" List every `null` in `plan.json` by where it is, in plain words.
