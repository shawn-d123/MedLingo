# take-home-b

Person B's pipeline: photo → extraction → PII strip → plain script → grounding → translate/back-translate → `awaiting_approval`.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in your real keys — never commit this file
```

## Run

```bash
node run.js test-images/prescription.jpg ur
```

Second argument must be one of the two hardcoded language codes in
`lib/pipeline.js` → `ALLOWED_LANGUAGES` (currently `ur` / `pl` —
change these to whatever the demo actually needs, but keep it to two).

## What happens

Prints progress per step, then the full job object as JSON. If any step
throws, `status` is set to `"failed"` with `error` populated and the
partial job object is still printed — nothing hangs silently.

## Notes / things to check before 13:00

- **`PIONEER_GLINER_MODEL`** in `.env.local` needs the real model/job-id
  string from your Pioneer dashboard (`GET /base-models`). Until it's
  set, step 3 is skipped gracefully and step 1's raw extraction is used
  as-is — that's fine for early iteration, just don't forget to wire it
  in before claiming Pioneer live at demo.
- **Test image**: use a **printed** prescription, not handwritten — put
  it in `test-images/`.
- Step 5 (Tavily grounding) will silently fall back to the un-grounded
  script if a drug has no leaflet found — check `groundingNotes` in the
  console output during testing to confirm it's actually finding real
  sources and not falling back on everything.
- This is a standalone folder for fast iteration. Once `run.js` works
  end-to-end, the functions in `lib/pipeline.js` move into
  `/app/api/jobs/route.ts` in the real Next.js repo — the function
  signatures are already designed to be called the same way from an API
  route (plain data in, plain data/promises out, no Node-CLI-specific
  assumptions except `extractFromImage`'s `fs.readFileSync`, which
  becomes a Buffer read from the uploaded file instead).
