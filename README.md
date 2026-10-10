# Qingshu · 澄数

**English** · [简体中文](README.zh-CN.md)

A browser-local spreadsheet cleaning workbench. Import a table, choose explicit rules, review changes and unresolved issues, then export the cleaned data with an audit trail.

Qingshu works with general spreadsheets, customer records, student registrations, and product catalogs. The interface and common rule instructions support English and Simplified Chinese. There is no application backend, account requirement, or file-upload service.

## Run locally

Use Node.js 20 or newer and npm. CI is configured for Node.js 20 and 22. Clone the repository, enter its directory, and start the app:

```sh
git clone https://github.com/mousetrapj/qingshu-data-cleaner.git
cd qingshu-data-cleaner
npm run dev
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). No `npm install`, build step, API key, or runtime CDN is required: browser dependencies are checked into `dist/vendor/`.

The development server serves **only `dist/`**, binds to `127.0.0.1` by default, and does not open a browser automatically. Set the `PORT` environment variable to use another port; `HOST` controls the bind address.

For static hosting, publish the contents of `dist/` using a host that serves JavaScript modules with the correct MIME type. Keep the `vendor/` files and their license notices. When redistributing the app without the rest of this repository, also include `LICENSE` and `THIRD_PARTY_NOTICES.md`. Use HTTP or HTTPS rather than opening `index.html` through `file://`.

## Use the workbench

1. **Import** a CSV, TSV, TXT table, or XLSX file, or paste a table with a header row. Select a worksheet for a multi-sheet workbook.
2. **Choose a preset** and confirm field types, required fields, export column names, and duplicate keys. Presets are editable starting points.
3. **Describe requirements**, if useful. Generate a draft, inspect what was recognized, and apply the supported rules. Unrecognized requirements remain visible and are not executed automatically.
4. **Run and review.** Inspect the original value, cleaned value, reason for each change, and unresolved issues. Changing rules or requirements makes the previous result stale.
5. **Export** the cleaned data, issue list, and processing report. Records requiring review remain in the output unless an explicitly enabled removal rule applies.

Use the language selector to switch between English and Simplified Chinese. This changes interface text and generated explanations; it does not translate imported table values or rename source fields.

### Supported cleaning rules

| Area | Behavior |
| --- | --- |
| Text | Trim leading/trailing whitespace; optionally convert full-width ASCII characters to half-width. Internal spaces are retained. |
| Identifiers | Keep student IDs, product codes, and other identifiers as text, including existing leading zeros. |
| Required fields | Report missing values without inventing replacements. |
| Phone numbers | Normalize basic **mainland China mobile-number** formatting, including spaces, hyphens, and supported country-code prefixes. |
| Email | Check basic structure and lowercase the domain; preserve the part before `@`. |
| Dates | Normalize valid, unambiguous year-first dates to `YYYY-MM-DD`, retaining supported time and time-zone suffixes. |
| Numbers | Remove valid thousands separators and normalize explicit decimal notation without floating-point rounding or guessing a currency. |
| Duplicates | Mark duplicates or remove fully identical cleaned rows; keep groups with conflicting field values. |
| Empty rows | Keep or remove fully empty records after the header, with removal recorded in the audit. |

For student registration tables, use a compound identity such as **Student ID + Course**. The same student can appear in different courses. Records with an empty selected key are excluded from duplicate removal. If no key is selected, the exact-duplicate removal mode compares the whole cleaned row.

### Requirement examples

For a table with fields named `Student ID`, `Name`, `Course`, `Email`, and `Enrollment Date`, enter one instruction per line:

```text
Trim all fields
Preserve leading zeros in Student ID
Name and Student ID are required
Check duplicates by Student ID + Course
Remove exact duplicate rows
Keep conflicting rows
Normalize Enrollment Date to YYYY-MM-DD
Lowercase email domains
```

Chinese instructions are also supported, for example `姓名和学号必填` and `按学号+课程检查重复`, when those fields exist in the imported table. Use actual column names: changing the interface language does not translate your schema.

Requirement recognition is a deterministic parser, not a general-purpose AI agent. Review the draft before applying it. Requests such as “fill every missing phone number” or “merge companies that look similar” require additional business rules and are not silently treated as completed. If you manually override a draft or edit its text, the report records that state.

## Exports and traceability

| Export | Contents |
| --- | --- |
| Full Excel result | Cleaned data, issues, changes, duplicate checks, removed records, field rules, and processing report. Long audit tables are split into additional sheets. |
| Issues and removals | The issue, duplicate, and removal audit tables. |
| Safe CSV | Cleaned data with protection prefixes for text that may be interpreted as a spreadsheet formula. |
| JSON report | Statistics, rule configuration, requirement status, and import notes; not the entire input table. |

**XLSX output uses text cells**, including amounts and dates, to preserve exact values and avoid formula execution. Convert fields to numeric/date types later if the destination system requires them. Safe CSV may add an apostrophe to risky text, and spreadsheet software may still infer numeric types when opening CSV. Prefer XLSX when leading zeros or long identifiers matter.

Each run starts from the imported values. Reports use the configuration captured for that run and retain source row references. The tool does not edit the original file.

## Limits and intentional boundaries

- Input: **10 MB** per file, **50,000 data records per worksheet**, and **100 columns**. The first non-empty row is the header. Oversized inputs are rejected rather than truncated.
- Modern `.xlsx` is supported; older `.xls` files must be saved as XLSX or CSV first.
- CSV import supports automatic encoding/delimiter detection and explicit import options. Check the preview when the source encoding is uncertain.
- Phone validation checks mainland China mobile-number format, not ownership or reachability. It is not an international phone-number validator.
- Ambiguous dates such as `02/03/2026`, invalid dates, malformed amounts, and uncertain values are preserved and reported.
- Missing information is not fabricated. Leading zeros or digits already lost in the source file cannot be recovered.
- XLSX formulas are not executed. Cached results may be read; missing cached results and other import limitations are noted for review.
- Duplicate conflicts are not merged automatically, and no external identity, address, or contact verification is performed.
- Automated checks cover code and data behavior. They do not replace browser interaction checks or validation of your own business rules.

## Data and browser storage

File contents are processed in the current browser and are not uploaded by the application. There is no analytics or remote AI request in the cleaning flow. Refreshing or closing the page requires importing the source file again.

Saved presets contain configuration, not spreadsheet records. Presets and the chosen interface language are stored in the current browser's local storage; they are not synchronized between browsers. Download results you need to retain before leaving the page.

## Development

```sh
npm run check
npm test
```

`check` validates JavaScript syntax and local static-asset references. `test` runs Node's built-in test runner against the repository tests. Tests load the same checked-in vendor bundles used by the browser, with no external installation or private runtime paths. The CI workflow runs both commands for Node 20 and 22.

| Path | Purpose |
| --- | --- |
| `dist/index.html`, `dist/styles.css`, `dist/app.js` | Workbench interface and interactions |
| `dist/engine.js` | Cleaning rules and requirement parsing |
| `dist/io.js` | CSV/TSV/XLSX input and output |
| `dist/report.js` | Run snapshots, requirement status, and audit tables |
| `dist/presets.js` | Editable preset definitions and fictional examples |
| `dist/i18n.js` | Explicit Chinese/English message handling |
| `dist/vendor/` | Checked-in browser dependencies and license copies |
| `scripts/` | Dependency-free development, check, and test commands |
| `tests/` | Automated data-integrity and integration tests |

There is no generated build tree: edit the application files in `dist/` directly. See [CONTRIBUTING.md](CONTRIBUTING.md) for workflow, localization, and rule-safety guidance.

## License

Qingshu's project code is licensed under the [MIT License](LICENSE), copyright 2026 Qingshu contributors. Third-party components retain their own licenses: JSZip is redistributed under its MIT option, sax uses BlueOak-1.0.0, and the JSZip bundle contains additional component notices. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
