# Werk: how to log a workout

Werk (`/m.html`) shows Krishna's training on a 3D body. It reads plain JSON files in `m/data/`.
To log a workout, an agent edits **one file** and commits to `main` of `krsna6/krishnasomandepalli.github.io`.
The site redeploys in about a minute. Nothing else needs to change; never edit `m.html` or `m/model/`.

## 1. The file to edit

`m/data/log/YYYY-MM.json`, the month of the workout's date (dates are New York time).
If the month's file does not exist yet, create it as:

```json
{ "month": "2026-12", "entries": [] }
```

## 2. One entry per exercise per day

Append to `entries` (keep them in date order; never rewrite or delete past entries unless Krishna asks):

```json
{ "date": "2026-11-07", "exercise": "Bench press", "sets": 4, "reps": 8, "weight_lb": 185, "rir": 2 }
```

| field | required | meaning |
|---|---|---|
| `date` | yes | `YYYY-MM-DD`, the day trained (New York time), inside the file's month |
| `exercise` | yes | exactly a name in `m/data/exercises.json` under `exercises` (match aliases to the name) |
| `sets` | yes | whole number of hard working sets, 1–20; warm-ups do not count |
| `reps` | yes | reps per set: a number, or a list with one number per set (`[8, 8, 7, 6]`) |
| `weight_lb` | yes | load in pounds per set; `0` for bodyweight; a number or a list like `reps` |
| `rir` | no | reps in reserve on the hard sets, 0–5, if Krishna says (0 = to failure) |
| `note` | no | short free text, e.g. `"paused reps"`, `"incline 30°"` |

Convert kilograms to pounds (× 2.2046, round to the nearest 0.5). If Krishna gives a range or is
unsure, ask him rather than guess.

## 3. An exercise that isn't in the map

Do **not** add it to `exercises.json` yourself: which muscles an exercise trains is a reviewed
decision. Log it anyway with the name Krishna used and `"unmapped": true`; the page shows it as
not mapped yet, and Claude will add the mapping for Krishna's review.

```json
{ "date": "2026-11-07", "exercise": "Cable crossover", "sets": 3, "reps": 12, "weight_lb": 30, "unmapped": true }
```

## 4. Sessions (the watch, or his report)

Alongside `entries`, a month file may hold `sessions`: one per workout day, for what the Apple Watch
or Krishna reports about the session as a whole. Werk shows them as a light ribbon under each day.

```json
{ "date": "2026-11-04", "kind": "strength", "summary": "chest", "source": "his Apple Watch photo",
  "duration": "85:12.63", "active_cal": 523, "total_cal": 638 }
```

`duration` exactly as the watch shows it (`m:ss` or `h:mm:ss`, decimals allowed); `active_cal` and
`total_cal` are the workout's kilocalories. Leave out what wasn't shared (never estimate); daily
activity rings are not workout calories, so put them in `note`, not in these fields.

### Exercises he reports without exact sets

A session may list what he did as `exercises`. An item already logged in `entries` has `"in_log": true`.
An item without exact sets (`"in_log": false`) still shows on the body as **hit**, in one base colour,
when it is linked to muscles by one of:

| field | meaning |
|---|---|
| `exercise` | a name (or list of names) in `exercises.json` → `exercises` |
| `groups` | group names from `exercises.json` → `regions[].groups[].name` (e.g. `"Abs"`) |
| `regions` | region names (e.g. `"Back"`) when he only says which part of the body |

```json
{ "name": "Back, 7 exercises", "reported": "3 sets each", "in_log": false, "missing": "names, weights", "regions": ["Back"] }
```

Link only what he said; leave an item unlinked if it's unclear which muscles it worked.

### Matching what he says to an exercise

1. Match his words to a name or an alias in `exercises.json` (case and plurals don't matter). A variation
   that has its own name there (incline, decline, close grip, machine, cable) is that exercise, not the base one.
2. If nothing matches, or two could, **ask him** which movement it was, offering 2–4 named movements. Never
   pick one yourself: until he answers, log it with `"unmapped": true` (entries) or leave the diary item unlinked.
3. When he names it, add his words to that exercise's `aliases` in the same commit, so next time it matches.
   New exercises are added by Claude for his review, not by you.
4. Cardio with no stroke or movement named (a swim lesson, a run) stays unlinked: it is not counted.

## 5. Muscle groups

`exercises.json` → `regions` groups the muscles for reading the week (body regions, then the groups
coaches program, each with the side it is seen from). Don't change `regions`.

## 6. His weight

When Krishna reports a new body weight, update `weight_lb` and `as_of` in `m/data/profile.json`.

## 7. Commit

One commit per logging session, message: `werk: log YYYY-MM-DD (exercise, exercise, …)`.
A check (`.github/workflows/werk-validate.yml`) runs on every change to `m/data/`; if it fails, its
log says exactly which entry is wrong. Fix that entry in a new commit.

## Example

Krishna says: "Today: bench 4 sets of 8 at 185, last set one rep short; then pull-ups 3×10."

```json
{ "date": "2026-11-07", "exercise": "Bench press", "sets": 4, "reps": [8, 8, 8, 7], "weight_lb": 185 },
{ "date": "2026-11-07", "exercise": "Pull-up", "sets": 3, "reps": 10, "weight_lb": 0 }
```

Commit: `werk: log 2026-11-07 (Bench press, Pull-up)`
