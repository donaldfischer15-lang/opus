# Opus V2 (test build)

Since Opus 1.43.0 (Nov 25), V2 is the live Opus at the site root, with the test-build limits off. The 1.42 app is kept at /v1/ to go back to. A change made only here does not reach the live Opus: make it in the root files too.

Opus 1.42 with V2 built into it: Up next that follows the clock, "Not today", rows that swipe, Still open, the Tomorrow card,
the hour's light, the Augur with its record, the Annals, and a page for every lift, meal, bill and supplement.

This build keeps its own storage (`opus2.*`), never writes GUIDE.md or the notification schedule, and syncs the same
plan and logs as Opus when connected to the same data repo. No personal data is in this repo.
