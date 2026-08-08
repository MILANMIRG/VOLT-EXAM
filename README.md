# VOLT — Online Examination Portal

A complete MCQ-based online examination system for **VOLT**, with separate
Admin and Student panels, login/registration, timed tests, auto-grading,
and result analytics. Runs entirely in the browser — no server or database
setup needed (great for a demo/college project); swap the storage layer for
a real backend later if you need multi-device sync.

## How to run

You don't need to install anything.

1. Unzip/open the `volt-exam-portal` folder.
2. Double-click **`index.html`** to open it in your browser
   — or, better, serve it locally so paths behave consistently:
   ```bash
   cd volt-exam-portal
   python3 -m http.server 8000
   ```
   then visit `http://localhost:8000`.

## Demo accounts

| Role    | Email               | Password    |
|---------|---------------------|-------------|
| Admin   | admin@volt.com      | admin123    |
| Student | student@volt.com    | student123  |

New students can also self-register from the login page (student role only —
admin accounts are seeded, not self-serve, matching how most institutions
provision staff access).

## What's included

**Student panel**
- Dashboard with available tests, attempt count, average & best score
- Timed MCQ test-taking screen: question palette, next/prev navigation,
  countdown timer that **auto-submits** when time runs out
- Instant results screen (score, correct/wrong/skipped breakdown)
- Full result history with a per-question **answer review** (your answer
  vs. the correct answer)

**Admin panel**
- Overview dashboard: totals, recent attempts, per-test performance
- Test builder: create/edit tests with title, subject, duration, and
  unlimited MCQ questions (4 options + correct answer + marks each)
- **Import questions from Excel/CSV** — upload an `.xlsx`, `.xls`, or `.csv`
  file with columns `Question, Option A, Option B, Option C, Option D,
  Correct Answer (A/B/C/D), Marks` and every row becomes a question
  automatically. A ready-to-fill **template** is one click away inside the
  test builder ("Download template"). Header matching is flexible (e.g.
  `Answer` or `Correct` both work for the correct-answer column), rows
  missing required fields are skipped with a clear reason instead of
  breaking the import, and imported questions land in the same editable
  builder below so you can fix anything before saving.
- Delete tests with a confirmation step
- Students directory with each student's attempt count and average score
- Results log across all students/tests, filterable by test

## Tech

Plain HTML/CSS/JS (no build step, no frameworks). Data is persisted in the
browser's `localStorage` under the key `volt_db_v1`, seeded on first load
with the admin account, a demo student, and two sample tests so you can
try the whole flow immediately.

```
volt-exam-portal/
├── index.html      Login / registration
├── student.html    Student dashboard + exam engine + results
├── admin.html       Admin dashboard + test builder + analytics
├── app.js           Shared: data layer, auth, navbar, toasts
├── student.js        Student panel logic
├── admin.js          Admin panel logic
└── style.css         VOLT design system (design tokens, components)
```

## Notes for extending this into a "real" product

- Replace `app.js`'s `getDB`/`saveDB` with real API calls (e.g. to a Node/
  Express + MongoDB or Firebase backend) — every other file only talks to
  those two functions, so the swap is isolated.
- Add password hashing server-side; passwords here are stored in plain
  text in `localStorage`, which is fine for a local demo but not for
  production.
- Add a per-test "publish/draft" toggle and a start/end date window if you
  want scheduled exams.
