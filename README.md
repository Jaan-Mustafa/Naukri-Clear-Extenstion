# Naukri Clear — Job Clipper

A Chrome/Brave/Edge extension that saves any job listing to your [Naukri Clear](https://naukriclear.com) tracker in one click. Auto-fills company, role, salary, and description on **LinkedIn**, **Indeed**, and **Naukri** — on any other site (Glassdoor, Wellfound, company careers pages, etc.), just fill the form manually and save.

![version](https://img.shields.io/badge/version-1.0.0-blue)
![manifest](https://img.shields.io/badge/manifest-v3-green)

---

## Features

- **Auto-extract on LinkedIn / Indeed / Naukri** — company, role, location, salary, description pre-filled.
- **Manual save on any site** — Glassdoor, Wellfound, Foundit, company careers pages, etc. Form always opens, just fill it in.
- **Side panel UI** — stays docked open while you browse, no re-opening popups.
- **Draft auto-save** — your edits survive accidental closes.
- **Duplicate detection** — if you already saved the job, you won't save it twice.
- **Works offline-ish** — drafts are scoped per-job-URL in local storage.

---

## Install

### Step 1 — Sign up on Naukri Clear

1. Go to **[naukriclear.com](https://naukriclear.com)** and sign in with Google.
2. You need an active account before the extension can save anything.

### Step 2 — Download the extension

Either:

```bash
git clone https://github.com/Jaan-Mustafa/Naukri-Clear-Extenstion.git
```

…or download the ZIP from the repo and unzip it somewhere permanent (don't delete the folder after install — Chrome reads from it).

### Step 3 — Load it into your browser

1. Open **`chrome://extensions`** (or `brave://extensions` / `edge://extensions`).
2. Enable the **Developer mode** toggle in the top right.
3. Click **Load unpacked**.
4. Select the folder you cloned/unzipped (the one that contains `manifest.json`).
5. Pin the extension: click the puzzle-piece icon in your browser toolbar → pin **Naukri Clear — Job Clipper**.

### Step 4 — Connect your account

1. Click the extension icon in the toolbar — a side panel opens on the right.
2. On the **Connect** screen, click the **Settings** link to open [naukriclear.com/settings](https://naukriclear.com/settings).
3. Generate an **Extension Token** (starts with `nc_...`) and copy it.
4. Paste the token into the side panel and click **Connect**.

You're done. The token is stored locally in your browser and never leaves your machine except when calling the Naukri Clear API.

---

## Using the extension

### On LinkedIn, Indeed, or Naukri
1. Open the job posting.
2. Click the extension icon — the side panel shows the extracted job details.
3. Review / edit the fields, pick a stage (`Interested` or `Applied`), add notes.
4. Hit **Save to Tracker**.
5. Click **View in Naukri Clear** to jump to your tracker.

### On any other site (Glassdoor, Wellfound, company careers page, etc.)
1. Open the job page.
2. Click the extension icon — the side panel opens with a **blank form** and the page URL auto-filled as the job link.
3. Copy-paste or type the company, role, location, salary from the page.
4. Hit **Save to Tracker**.

If extraction fails on a supported site (rare), the flow is the same as the manual one — blank form, you fill it in.

---

## Updating the extension

Since this is a manually-loaded (unpacked) extension, updates aren't automatic:

```bash
cd Naukri-Clear-Extenstion
git pull
```

Then go to `chrome://extensions` and click the **refresh** icon on the Naukri Clear card.

---

## Troubleshooting

**"Could not verify token"**
- Your token expired or was revoked. Generate a new one at [naukriclear.com/settings](https://naukriclear.com/settings).

**"Failed to save"**
- Check that you're online and that naukriclear.com is reachable.
- Try regenerating the token.

**The extension icon isn't visible**
- Click the puzzle-piece icon in the toolbar, find Naukri Clear, and click the pin icon.

**Side panel doesn't open**
- Requires Chrome/Brave/Edge version **114 or newer**. Update your browser.

**Extraction returns a blank form on a job page**
- The job site may have changed its markup. Fill in the fields manually and still save — we'll ship a fix in the next update.

---

## For developers

### Project layout

```
extension/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker — opens side panel on icon click
├── config.js              # API/app URL config (prod defaults + storage override)
├── content/
│   └── extractor.js       # Content script — extracts job data from pages
├── popup/
│   ├── popup.html         # Side panel UI
│   ├── popup.js           # Side panel logic (auth, extract, save)
│   └── popup.css
└── icons/
```

### Supported sites

| Site     | URL patterns                                             |
| -------- | -------------------------------------------------------- |
| LinkedIn | `/jobs/view/…`, `/jobs/collections/…`, `?currentJobId=…` |
| Indeed   | `/viewjob`, `/job/…`, `?vjk=…`, `?jk=…`                  |
| Naukri   | `/job-listings-…`, `/jobs/…`, `/<role>-jobs-<id>`        |

Any page embedding a `JobPosting` JSON-LD block is also recognized, regardless of URL pattern.

---

## License

MIT

## Feedback

Open an issue on this repo, or use the in-app feedback form on [naukriclear.com](https://naukriclear.com).
