# Project: Records app (synthetic)

Goal: a small web app where a signed-in user can add, browse and filter their own records.

Acceptance criteria (project level):
- AC1 A user sees only their own records.
- AC2 The list can be filtered by status; an empty filter shows all records.
- AC3 Records can be exported to CSV.

Budget for this week: 12 model tasks, 40 tool calls per task, 2 attempts per task. Reviewer route: a different model family than the authors (configured).

## Tasks

| ID | Title | State | Notes |
| --- | --- | --- | --- |
| T1 | Add-record form | queued | Criteria: fields title (required, ≤200), status (open/closed). Interface: records API v1. Write paths: `src/Form/`, `templates/record/`. Test env: local synthetic DB. Dependencies: none. |
| T2 | Filter the list by status | queued | Interface: records API v1. Write paths: `src/Controller/RecordList.php`. No acceptance criteria written yet. |
| T3 | CSV export | awaiting_review | Backend done at revision `a1b2c3d`. Tests 6/6 passed at `a1b2c3d`. Review requested; no review record yet. |
