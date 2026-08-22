# Take-Home — Person A frontend (capture → approval → result)

Two deviations from the brief, up front:

1. **This project runs on TanStack Start (React 19 + Vite), not Next.js.** The router and framework are fixed here. Everything maps 1:1: pages become routes in `src/routes/`, and `/api/jobs*` become TanStack server routes under `src/routes/api/`. Same URLs, same job contract, same fetch calls — B and C see no difference. The env flag becomes `VITE_USE_MOCK` (client-readable equivalent of `NEXT_PUBLIC_*`).
2. **"ImpeccableUI" is not a real published library** I can install. shadcn/ui (new-york style) is already fully installed here — button, card, input, textarea, badge, select, separator, skeleton, sonner and more. I'll use those plus a tight design-token layer for the "clinical instrument" look.

## Screens

Approval gets built first and gets the design time.

**/approve/$jobId — Approval gate (primary screen)**
Two-column, high-contrast, large type. Left rail: extracted prescription rows (drug / dose / freq / days) as editable fields. Right: three stacked language panels — plain English script, target-language translation (RTL-aware for Urdu), back-translation. The back-translation panel sits directly under the translation so the eye compares them without scrolling.

- Every field editable inline (extracted rows, plain script, translation).
- Flagged terms (`flags[]`) highlighted inside the script and back-translation with a severity chip showing kind + confidence; a flag summary strip pins to the top ("2 dosage terms to verify").
- Two actions: **Re-check edits** (PATCH-style re-submit that re-runs B's grounding only, never the photo read) and **Approve & generate** (POST `/api/jobs/:id/approve`).
- Approve is disabled until `translation` and `backTranslation` both exist — the ordering guard from the brief, enforced in UI.
- A short "what you are approving" line stating the clinician approves the translated content, not the English draft.

**/ — Capture**
Single card: file input (`accept="image/*"` + `capture="environment"`) with thumbnail preview, language select hardcoded to Urdu (`ur`) and Polish (`pl`), one submit → POST `/api/jobs` with `{ imageBase64, targetLanguage }` → navigate to `/approve/$jobId`. Interim `reading`/`grounding` state shows a calm status line, not a spinner-only screen.

**/result/$jobId — Result**
Plain `<video controls>` on `outputVideoUrl` (VEED burns subtitles), the patient-facing script text below it in the target language, and a "synthesizing" waiting state while C works.

## Data flow

- `useQuery` polling `GET /api/jobs/:id` every 2s, stops on `done` / `failed`.
- One `src/lib/job.ts` with the job type (exact shape from the brief) + status helpers; one `src/lib/jobs.api.ts` with the three fetch calls, reading `VITE_USE_MOCK`.
- Route-level status routing: `awaiting_approval` → approval screen, `synthesizing`/`done` → result screen.

## Mock backend

Server routes under `src/routes/api/` backed by an in-memory `Map` (no DB):
- `POST /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs/:id/approve`, plus `POST /api/jobs/:id/recheck` for the edit loop.
- With mock on, `GET` advances a fake status timeline (reading → grounding → awaiting_approval) and returns the fixture job from the primer verbatim — real Amoxicillin 500mg TDS 7 days text, real Urdu translation string, real back-translation, real flags. No lorem ipsum anywhere.
- `approve` sets `approvedAt`, flips to `synthesizing`, then after a delay serves a sample video URL so the full flow demos end to end today.

## Technical notes

- Design tokens in `src/styles.css`: near-white clinical background, deep ink foreground, one amber "verify" and one red "divergence" accent, larger base type scale, generous panel padding. No gradients, no hero, no nav bar, no auth, no responsive/mobile work.
- Urdu panels get `dir="rtl"` and a font stack with Noto Nastaliq fallback, loaded via `<link>` in the root route head.
- Head metadata set per route with real titles/descriptions.

Out of scope, per your non-goals: login, database, deployment, mobile layout, extra languages, landing page, settings, speculative error states.
