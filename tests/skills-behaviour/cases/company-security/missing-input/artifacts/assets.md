# Asset and data-flow brief — project "Records app" (synthetic)

Assets:
- A1 User records (title, status, owner). Class: personal data of the signed-in user.
- A2 Session tokens issued at sign-in. Class: credential.
- A3 Synthetic seed database used by the test environment. Class: synthetic.

Data flow: browser → HTTPS → application server → records API v1 → database. Export to CSV is generated on
the server and downloaded by the browser. No third-party service is involved.

Trust boundaries: browser ↔ server (untrusted input), server ↔ database (credentialed), test environment ↔
production (none: no shared credentials, separate database).

Known state: the CSV export was added last week; the filter endpoint is under review.
