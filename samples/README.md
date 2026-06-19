# Sample files

These are illustrative, safe-to-commit samples — they contain **no real secrets
or personal data**.

| File | Purpose |
|------|---------|
| `sample-hr-contacts.xlsx` | Example import file with the required columns `companyName`, `location`, `email` (5 example rows using `*.example` addresses). Upload it via **Contacts → Import Excel**. |
| `sample-resume.txt` | Placeholder describing the resume. Replace with your real `resume.pdf` and upload via **Settings → Resume**. Do not commit your real resume. |

## Excel import format

The importer reads the first worksheet and maps columns **by header name**:

| Column | Required | Notes |
|--------|----------|-------|
| `companyName` | yes | recruiter / company name |
| `location` | no | city / region (optional) |
| `email` | yes | invalid emails are skipped; duplicates de-duplicated |
