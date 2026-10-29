# Lab Code Library

A small website where students browse, search, copy and download lab exam programs. An administrator adds programs by pasting code or uploading a source file.

- Frontend: plain HTML, CSS and JavaScript (no build step, no framework)
- Backend: one Netlify Function (`/api/*`)
- Storage: Netlify Blobs (shared and persistent across deploys)
- Only runtime dependency: `@netlify/blobs`

## Project layout

```
public/            the website (index.html, admin.html, css/, js/)
netlify/functions/ api.mjs + lib/ (handler, store, security, validate, samples, http)
tests/             automated tests (api.test.mjs, frontend.test.mjs, optional e2e/)
netlify.toml       Netlify settings and security headers
.env.example       names of the environment variables (placeholders only)
```

## 1. Run it on your computer

1. Install Node.js 20 or newer from nodejs.org.
2. Open a terminal in the project folder and run `npm install`.
3. Copy `.env.example` to a new file named `.env`. Put a real password in `ADMIN_PASSWORD` and a random 32+ character string in `SESSION_SECRET`. Generate one with:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
4. Run `npx netlify dev` and open the address it prints (usually http://localhost:8888). The admin page is at `/admin`.

Local data lives in a local sandbox of Netlify Blobs and is separate from your live site.

## 2. Deploy to Netlify

1. Create a GitHub repository and push this folder. `.env` is ignored by `.gitignore`, so your secrets are not uploaded.
2. In Netlify choose Add new site, then Import an existing project, then GitHub, and pick the repository.
3. Leave the build command empty. Publish directory `public` and functions directory `netlify/functions` come from `netlify.toml`.
4. Before the first deploy, open Site configuration, then Environment variables, and add `ADMIN_PASSWORD` and `SESSION_SECRET` (same rules as above). Mark them as secret values.
5. Deploy. Open the site: you should see six sample programs. Open `/admin`, sign in, and add a test program.

If you add the variables after deploying, trigger a new deploy so the function picks them up.

## Admin guide

- Sign in at `/admin`. Sessions are signed, expire after one hour, and are checked by the server on every change.
- Add a program: choose or type a subject, give the experiment number and title, pick the language, then paste code or upload a file. Uploaded text appears in the code box so you can edit it before saving.
- Supported uploads: `.dart .java .py .js .html .css .sql .c .cpp .txt`, up to 500 KB.
- A subject is created the first time you use its name. Nothing in the code needs changing.
- Experiment numbers must be unique inside a subject. To renumber, edit the program and change its number; the server refuses it if the number is taken.
- The six sample programs are labelled "Sample:" in their descriptions. Delete them whenever you like; they never come back.

## Change or reset the admin password

Change `ADMIN_PASSWORD` in Netlify (Environment variables) and redeploy. To sign out everyone immediately, also change `SESSION_SECRET`: all existing sessions stop working.

## Backup and restore

The library is one JSON document in the Blobs store `lab-code-library`, key `library`. Public GET `/api/programs` returns every program, so a simple backup is:

```
curl https://YOUR-SITE.netlify.app/api/programs -o backup.json
```

To restore with the Netlify CLI (after `npx netlify login` and `npx netlify link`), write a file containing `{"version":1,"programs":[ ...the programs array from backup.json... ]}` and run:

```
npx netlify blobs:set lab-code-library library --input restore.json
```

Check `npx netlify blobs:set --help` if your CLI version words the options differently. Test a restore on a scratch site before you need it.

## Update the project without losing data

Stored programs live in Netlify Blobs, not in your repository, so pushing new code and redeploying does not touch them. Keep the store name (`lab-code-library`) and key (`library`) unchanged in `netlify/functions/lib/store.mjs`. Take a backup before major changes.

## Security notes

- Passwords and the signing secret exist only in environment variables. The browser never receives them.
- Every create, edit and delete endpoint verifies the signed session on the server. The server also validates every field, the 500 KB size limit and plain-text content.
- Code is shown with `textContent` only, never as HTML. A Content-Security-Policy header blocks inline scripts.
- Login and write requests are rate limited per IP. This limiter lives in function memory, so it is a brake, not a guarantee, across several function instances.
- Public visitors can only read.

## Tests

- `npm test` runs the API tests (in-memory store) and the tokenizer/file-name tests.
- `npm run check` runs syntax checks on all JavaScript.
- Optional browser test: see the header of `tests/e2e/browser_test.py`.

### What has and has not been verified

Verified locally: API behaviour with an in-memory store (auth, expiry, tampering, validation, duplicates, concurrent writes, rate limiting), and the full UI in headless Chromium against a local server that uses the same API code with an in-memory store.

Not verified (needs your Netlify account): real Netlify Blobs reads and writes, conditional writes through `@netlify/blobs`, `netlify dev`, the deployed site, and persistence across a real redeploy. Run the checks in Troubleshooting after deploying.

## Troubleshooting

- Login says "Admin access is not configured": `ADMIN_PASSWORD` or `SESSION_SECRET` is missing, or the secret is shorter than 32 characters. Fix it in Netlify and redeploy.
- Login says "Incorrect password": check for spaces; the value is case sensitive.
- Many wrong attempts return 429. Wait up to 15 minutes.
- Public page shows "Could not load programs": open `/api/programs` directly and read the error. In Netlify, check Logs, then Functions, then `api`.
- Blobs errors after `npm install`: check that `@netlify/blobs` is 8.1 or newer (conditional writes need it).
- Saved programs vanish locally after clearing `.netlify/`: that is only the local sandbox.
- Seeing a 401 right after signing in: your computer clock is far off, or `SESSION_SECRET` changed between login and request.
