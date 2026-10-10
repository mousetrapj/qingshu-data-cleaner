# Contributing to Qingshu

**English** · [简体中文](CONTRIBUTING.zh-CN.md)

Contributions that improve data integrity, understandable rules, accessibility, and language coverage are welcome. Use fictional or anonymized examples in issues and pull requests; do not attach real customer or student records.

## Development workflow

1. Fork and clone the repository. Use Node.js 20 or newer; CI is configured for Node 20 and 22.
2. Work on a branch and edit source files in `dist/`. There is no build step or package installation requirement.
3. Use `npm run dev` when you want to inspect the app locally.
4. Run `npm run check` and `npm test` before opening a pull request.
5. Explain the concrete problem, resulting behavior, and checks you performed. State any browser checks you did not perform; automated tests alone are not browser verification.

The dev server only exposes `dist/`. Keep development scripts, test fixtures, and repository metadata outside that directory. New runtime dependencies need a clear reason, distributable local assets, and preserved license notices.

## Data-handling invariants

- Keep original imported strings and source row identities. Derive each result from the original data, not a previous cleaned result.
- Do not turn identifiers or amounts into floating-point numbers. Preserve existing leading zeros and decimal precision.
- Make deterministic changes only. Preserve invalid or ambiguous values and explain what requires review.
- Skip duplicate removal when a selected key is missing. Preserve an entire key group when its field values conflict.
- Keep removed records and their reasons in the audit. Statistics must distinguish all input issues from issues in retained output.
- Tie export reports to the configuration used for that run. Edited, unapplied, and manually overridden requirements must not be reported as executed.
- Keep spreadsheet formula protection and explicit text cells in exports. Treat imported values and column names as untrusted display content.
- Do not add file uploads, remote AI calls, or analytics to the cleaning flow without an explicit product and privacy design change.

For a new cleaning rule, add a minimal regression case covering its intended effect and a nearby value it must leave alone. Changes to import/export or duplicate handling should include a meaningful round-trip or no-data-loss case. A test that merely restates the implementation is not enough.

## Chinese and English

The explicit message API is in `dist/i18n.js`:

| API | Purpose |
| --- | --- |
| `tr(zh, en)` | Register a complete Chinese/English message pair and return the current-language text. |
| `getLocale()` | Read the current locale (`zh-CN` or `en`). |
| `setLocale(locale)` | Select a supported locale; in the browser, update the document language and saved preference. |
| `localize(message, targetLocale)` | Re-render an already registered message in the selected locale; unregistered text stays unchanged. |

For example, inside a module in `dist/`:

```js
import { tr } from './i18n.js';

const message = tr(
  `原文件第 ${sourceRow} 行需要确认。`,
  `Source row ${sourceRow} needs review.`,
);
```

Translate complete messages, including punctuation and interpolation order. Keep imported values, user-written requirements, and actual field names unchanged. Do not change stable issue codes or rule keys to translate the UI.

When adding a requirement grammar, cover supported Chinese and English phrasing and reject unsupported trailing actions. A sentence should not be partly executed while the whole sentence is marked as understood. Keep built-in examples and the two READMEs consistent with the parser.

Tests that change the global locale should restore the previous locale afterwards. Check both locales for visible labels, dialogs, issue explanations, and report output when you change those areas.

## Testing and vendored libraries

`npm test` discovers `*.test.mjs`, `*.test.js`, and `*.test.cjs` files under `tests/` and runs them through Node's built-in test runner. It does not rely on a shell glob or third-party test framework. `npm run check` checks syntax and local HTML/CSS/module asset references without running the tests again.

Tests that need XLSX support load the same assets used by the browser:

```js
import { setupVendor } from './helpers/vendor.mjs';

setupVendor();
```

The helper is synchronous, installs `globalThis.JSZip` and `globalThis.sax`, and resolves files relative to the repository. It wraps trusted checked-in code; it is not a sandbox for arbitrary files. Do not add machine-specific paths or environment variables to locate dependencies.

When updating a vendor bundle, record the upstream version, retain its original notices, and update [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). JSZip, its bundled components, and sax do not all share the project's MIT license.

## Pull requests and licensing

Keep each change focused. Describe new import limitations, configuration behavior, or output format changes that reviewers and users need to understand. Update both language versions of the documentation when behavior changes.

Project contributions are provided under the [MIT License](LICENSE). Third-party code must retain its original applicable licenses and attribution.
