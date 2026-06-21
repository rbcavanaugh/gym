# GYM

A minimalist workout tracker. Runs entirely in the browser — no server, no account, no data collection. Installable as a PWA on iOS via **Add to Home Screen**.

---

## User Guide

**Home** — tap **New Workout** to start a session. If a session from the past two hours exists, it resumes automatically.

**Select** — choose exercises and stretches for the workout. Tap an item to select it; tap again to deselect. Long press to remove it from the list entirely.

- **Group** — group all currently selected (ungrouped) items into a superset. Works with one or more exercises.
- **Search** — filter the list by name. If no match is found, you can add the item as a session-only custom exercise.
- **Done** — move to the workout view.

**Workout** — tap an exercise to increment the set counter. Long press to mark it as done and remove it from the session.

**Settings**

- *Theme* — light or dark.
- *Keep screen awake* — prevents the screen from locking during a workout. Off by default.
- *Reset to defaults* — restores the exercise or stretch list to its original state and clears all selections.
- *GitHub Sync* — paste a personal access token to push your current exercise or stretch list back to your fork permanently.

---

## Fork and Personalize

1. **Fork** this repository to your GitHub account.
2. Enable **GitHub Pages** in the repo settings (Settings → Pages → Deploy from branch → `main` / `root`).
3. Your app will be live at `https://<your-username>.github.io/gym`.

**"Installing"" on your phone**

GYM is a Progressive Web App (PWA) — it can be installed to your home screen and used offline like a native app.

*iOS (Safari)*
1. Open your GitHub Pages URL in Safari.
2. Tap the **Share** button (rectangle with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**.
4. Confirm the name and tap **Add**.

*Android (Chrome)*
1. Open your GitHub Pages URL in Chrome.
2. Tap the three-dot menu in the top right.
3. Tap **Add to Home screen**.
4. Confirm and tap **Add**.

Once installed, the app runs from cache and does not require a network connection.

---

**Editing the default exercise and stretch lists**

- `exercises.csv` — the working list loaded on each visit.
- `stretches.csv` — same, for stretches.
- `default_exercises.csv` / `default_stretches.csv` — what **Reset to defaults** restores.

Each file is a plain CSV with a single `name` column. Edit directly on GitHub or locally and push.

**GitHub Sync (in-app)**

To push changes made during a session (added or removed exercises) back to your fork without editing files manually:

1. Create a [fine-grained personal access token](https://github.com/settings/tokens) scoped **only to your gym fork** (not all repositories) with **Contents: Read and Write** access.
2. Open **Settings** in the app, paste the token into the PAT field, and tap **Update exercises.csv** or **Update stretches.csv**.

The token is never stored — you will need to paste it each session.

**A note on PAT security**

Your PAT is not stored, logged, or transmitted anywhere other than directly to the GitHub API. That said, treat any PAT with care:

- Scope it only to this repository, as described above — never use a broad or all-repository token. If a repo-scoped token is exposed, the blast radius is limited to the contents of this one repository.
- Revoke and regenerate the token if you have any reason to believe it was exposed.
- Before using this app, you are encouraged to review the source code (`app.js`) to verify how the token is used. The relevant function is `pushCSVToGitHub`.
