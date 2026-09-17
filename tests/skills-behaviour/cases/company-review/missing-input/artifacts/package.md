# Review package — task REC-7 (synthetic)

- Repo: `records-app` (synthetic), base `4f00a11`, head `9c2e7b0`; diff: `diff.patch`.
- Package artifacts, sha256: `diff.patch` `cd3991fe9d87abf091bf2db1780efb7acd2dc2ee86f92e660a8c53e26a6c88ea`, `test-output.txt` `9bdf1cf6fd9550c4747606824a6173f9f5c450de460edd04b4f7b1e96e3f6cf8`.

## Architect's brief (revision 2)

Goal: filter the record list by status.

Acceptance criteria:
- AC1 `filterRecords(records, "open")` returns only records with status `open`.
- AC2 An empty or missing status returns all records.
- AC3 An unknown status (anything other than `open` or `closed`) throws `InvalidStatus`.

Plan: a pure function in `src/filter.js`; no database access. Expected tests: one per criterion, including the error case.

## Developer's report

All criteria done. Tests pass (`test-output.txt`).
