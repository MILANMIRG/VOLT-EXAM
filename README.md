# VOLT — Online Examination Portal

A complete MCQ-based online examination system for **VOLT**, with separate
Admin and Student panels, login/registration, timed tests, auto-grading,
and result analytics. Runs entirely in the browser — no server or database
setup needed (great for a demo/college project); swap the storage layer for
a real backend later if you need multi-device sync.

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
