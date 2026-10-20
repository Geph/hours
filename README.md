# Hours

A minimal, colorful work-hours tracker for keeping work and time off in balance. Built for a personal website, with a responsive layout for phones and quick entry throughout the day.

## What it does

- Logs work in 30-minute increments across six categories: Admin, WHIMC/QRF, INVITE, Teaching, Flex time, and Engagement.
- Shows hours worked on the selected day, recent entries, and when time was last entered.
- Tracks 40-hour Sunday–Saturday weeks, with hours owed or banked carried into the next week. Vacation, sick leave, holidays, and other leave reduce the target in half-day or full-day amounts.
- Treats a workday as 2 a.m. through 1:59 a.m. the next morning in America/Denver, including daylight saving changes.
- Offers date and category filters, a category pie chart, daily category breakdowns, and longer-range reporting-period charts. Expected-hour markers are 8 hours per day, 40 per week, or 80 for historical two-week periods; overtime extends beyond the marker in red, and leave is dark gray.
- Lets you edit entries, search history, export CSV, and download a complete JSON backup. Entry timestamps are stored in UTC and displayed in Denver time; edits preserve the original entry timestamp.
- Supports private legacy datasets containing aggregated reporting periods, original notes, target adjustments, and carried balances without inventing daily dates for old totals.
- Uses four-digit PIN sign-in and a shared server database so the same log is available across devices.

## Technology

Vanilla HTML, CSS, and JavaScript modules, with a PHP JSON API and SQLite database. No frontend framework, npm dependencies, or build step is required. Production hosting needs PHP 8.2 or newer with PDO SQLite, Apache with rewrite support, and HTTPS. This is a server application, so GitHub Pages cannot host its backend.

## Public code, private hours

**This repository contains no personal hour history.** The tracked `private/seed.example.json` has empty records and reporting periods. First-time setup creates a private `seed.json` starting in the current workweek.

Git ignores private data, PIN configuration, SQLite files (including journal/WAL files), exports, backups, spreadsheets, screenshots, runtime folders, and deployment ZIPs. The app hashes the PIN instead of storing it in plaintext. The protected `private` directory is denied by Apache rules. The state API requires an authenticated session; an authenticated browser can read its own hours.

Never force-add private files or upload a personal deployment archive to a GitHub release. `.gitignore` does not remove data already committed to Git history.

## Install on DreamHost / Apache

1. Download or clone this repository. Upload the app into a new subfolder such as `/home/YOUR_USER/YOUR_DOMAIN/hours/`. Include both hidden `.htaccess` files. Keep your existing website homepage and domain-level `.htaccess` intact.
2. Enable PHP 8.2+ with PDO SQLite and HTTPS. The PHP process needs write access to the app's `private` folder; do not make it world-writable.
3. In the app folder on the server, run:

   ```sh
   php tools/set_pin.php
   ```

   Choose exactly four digits; leading zeros are supported. The prompt may show input in your terminal, but the PIN is not a command argument. Setup writes its hash to `private/config.php` and initializes an empty private dataset if none exists. Run the same command to change the PIN. `set_password.php` is a compatibility alias.
4. Open `https://YOUR_DOMAIN/hours/` and sign in. The API initializes `private/hours.sqlite` from your private seed once. Subsequent entries are stored in SQLite.
5. Confirm that `/hours/private/seed.json` returns **403**. In a private browser window without signing in, `/hours/api.php?action=state` should return **401** with `Please sign in.` If no PIN is configured, the API instead returns **503** with `configured: false`.

For an existing installation, back up first. Replace only code and safe example files. **Preserve your existing `private/seed.json`, `private/config.php`, and SQLite database and its associated files.** The public code does not include or replace your personal history. Keep the private seed because legacy source records and backup validation depend on it. Do not copy the empty example over a real seed.

## Local use

Install PHP with PDO SQLite. Configure a PIN with `php tools/set_pin.php`, then run:

```sh
php -S 127.0.0.1:3038 -t public
```

Open `http://127.0.0.1:3038/`. This binds only to your computer. The built-in PHP server is for development; use Apache/HTTPS for your website. `GINGER_DATA_DIR` optionally selects a separate private data directory. Run setup with the same variable before launching the server. Keep `GINGER_LOCAL_PREVIEW` unset on a real website.

## Backups and privacy

Use **Export → Download complete backup (JSON)** to save all entries and metadata. CSV exports include work dates, categories, notes, and entry/edit timestamps. Keep exports private.

To restore a compatible JSON backup, place it outside the public website and run:

```sh
php tools/restore_backup.php /absolute/private/path/backup.json
```

The tool validates dataset metadata and original imported records, creates a SQLite safety backup, and asks you to type `RESTORE` before replacing entries. A backup from another dataset requires its matching private seed. Refresh all open app tabs after restoring. For live database backups, use SQLite's backup facility rather than copying only the main database while WAL writes are active.

PINs have only 10,000 combinations. The API retains a limit of ten failed attempts per IP in fifteen minutes, session expiry, CSRF checks, and secure cookies over HTTPS. This is a small personal tracker, not a multi-user or high-security system.

## Development checks

Tests use synthetic entries and disposable databases, not a personal dataset.

```sh
node --check public/app.mjs
node --test tests/core.test.mjs
python tests/api_test.py
```

Set `PHP_BIN` to a PHP executable if it is not on your PATH. The API tests require PDO SQLite. There is no dependency installation or asset build step.

## Project layout

```text
public/                     UI, styles, calculations, PHP API
private/seed.example.json   empty starter template (tracked)
private/seed.json           private dataset (ignored)
private/config.php          PIN hash (ignored)
private/hours.sqlite        live entries (ignored)
tools/set_pin.php           PIN setup and empty-dataset initialization
tools/restore_backup.php    validated JSON backup restoration
tests/                      synthetic calculation and API tests
```

The existing MIT license applies; see [LICENSE](LICENSE).
