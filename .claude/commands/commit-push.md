# Commit, Push & Deploy

**Trigger this skill** whenever the user says anything like:
"commit & push", "commit changes", "commit all changes", "commit & deploy",
"push changes", "save and push", "deploy", "ship it", or any similar phrasing
that means: stage → commit → push → optionally deploy.

---

## Workflow

Follow every step below in order. Do not skip steps.

### Step 1 — Inspect the repo (run all 3 in parallel)

```bash
git -C "D:\Apps\React_Firebase_SMP CashBook" status
```
```bash
git -C "D:\Apps\React_Firebase_SMP CashBook" diff HEAD
```
```bash
git -C "D:\Apps\React_Firebase_SMP CashBook" log --oneline -6
```

### Step 2 — Safety checks before staging

- **Never stage** any of the following, even if they are modified:
  - `.env` files anywhere in the tree
  - `server/smp-cashbook-service-account.json`
  - `.firebase/` directory
  - Any file matching `*.key`, `*.pem`, `*.p12`
- If any such file appears in `git status`, warn the user and skip it.
- If there are **no changes** to commit (clean working tree), tell the user and stop.

### Step 3 — Stage modified files

Stage only tracked, modified files plus safe untracked files:

```bash
git -C "D:\Apps\React_Firebase_SMP CashBook" add \
  client/ server/src/ shared/ \
  firebase.json firestore.rules firestore.indexes.json \
  .firebaserc package.json package-lock.json \
  functions/src/ functions/package.json
```

Use `git add <specific-files>` — **do not** use `git add -A` or `git add .` as those would pick up secrets.

### Step 4 — Draft a commit message

- Read the diff from Step 1.
- Write a concise imperative-mood subject line (≤72 chars) that summarises *why* the change was made, not just what changed.
- Follow the style of the recent commits from Step 1 (they all start with `feat:`, `fix:`, `refactor:` etc.).
- End the commit body with the attribution trailer:
  ```
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```

### Step 5 — Commit

```bash
git -C "D:\Apps\React_Firebase_SMP CashBook" commit -m "$(cat <<'EOF'
<subject line here>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Verify the commit succeeded with `git status`.

### Step 6 — Push to GitHub

```bash
git -C "D:\Apps\React_Firebase_SMP CashBook" push origin main
```

Report the short commit SHA and branch after pushing.

---

## Step 7 — Firebase deploy (always run)

Run this step **after every successful push**, regardless of what the user said.

**Why both targets matter:** `functions/lib/index.js` is a separately built
bundle (via esbuild) that imports `server/src/app.ts` — it is NOT rebuilt
automatically from `server/` or `shared/` source changes. Firebase Hosting's
`/api/**` rewrite serves that bundle in production. If you deploy hosting
without rebuilding functions, any new/changed server route (controllers,
routes, services under `server/src/`, or `shared/`) will silently 404 in
production while working fine locally. **Always rebuild and deploy both
together — never deploy hosting alone when `server/` or `shared/` changed.**

**7a — Build the client:**

```bash
cd "D:\Apps\React_Firebase_SMP CashBook" && npm run build -w client
```

Wait for the build to succeed before continuing. If it fails, report the
error to the user and stop — do not attempt to deploy broken code.

**7b — Build the functions bundle:**

```bash
cd "D:\Apps\React_Firebase_SMP CashBook\functions" && npm run build
```

Wait for the build to succeed before continuing. If it fails, report the
error to the user and stop — do not attempt to deploy broken code.

**7c — Deploy functions + hosting to Firebase together:**

```bash
cd "D:\Apps\React_Firebase_SMP CashBook" && npx firebase-tools deploy --only functions,hosting --project smp-cashbook
```

Report the hosting URL and function URL from the deploy output when done.

---

## Error handling

| Situation | Action |
|-----------|--------|
| Nothing to commit | Tell the user the working tree is clean |
| Build fails | Show the error, stop before deploying |
| Push rejected (behind remote) | Tell user to pull first; do not force-push |
| Firebase deploy fails | Show the error; the git push already succeeded |

---

## Example output to user

> Committed `abc1234` — "feat: add PDF export for ledger heads list"
> Pushed to `tejukargal/SMP_CB-React_Firebase` → main ✓
> Deployed functions + hosting → https://smp-cashbook.web.app ✓
