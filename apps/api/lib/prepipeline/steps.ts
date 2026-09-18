// Person B's half — everything BEFORE the approval gate.
// Function names and signatures match the interface B's run.js defined
// (extractFromImage, stripPii, structureCleanup, writePlainScript,
// groundAndRefine, translateAndVerify, ALLOWED_LANGUAGES), so B's own
// lib/pipeline.js implementation can replace this file's internals without
// touching any caller. Reconstructed here because that file wasn't in B's push.

import OpenAI from "openai";
import { withTimeout, mockMode, sleep } from "../pipeline/util";
import { mockExtraction, mockPlainScript, mockTranslate } from "./fixtures";
import type { ExtractedMedication, Flag } from "../types";

export const ALLOWED_LANGUAGES: Record<string, string> = { ur: "Urdu", pl: "Polish" };

const LLM_TIMEOUT_MS = 60_000;
const VISION_MODEL = process.env.OPENAI_VISION_MODEL ?? "gpt-4o";

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set (see .env.example)");
  return (_openai ??= new OpenAI());
}

function parseJson<T>(text: string, label: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`${label} returned unparseable JSON: ${cleaned.slice(0, 120)}…`);
  }
}

export interface RawExtraction {
  medications: (ExtractedMedication & { warnings?: string[] })[];
  /** Full readable transcription of the sheet, identity lines already redacted by the model. */
  transcription?: string;
  notes?: string;
}

// STEP 1 — Extract (OpenAI vision). Accepts a data URL or https URL.
export async function extractFromImage(imageUrl: string): Promise<RawExtraction> {
  if (mockMode()) {
    await sleep(400);
    return mockExtraction;
  }

  const res = await withTimeout(
    openai().chat.completions.create({
      model: VISION_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You read prescriptions and discharge sheets. Extract ONLY medication instructions. " +
            "Expand common abbreviations when interpreting (TDS=three times daily, BD=twice daily, " +
            "OD=once daily, PO=by mouth, 7/7=seven days) but keep the freq field as written on the paper. " +
            'Return JSON: {"medications":[{"drug":string,"dose":string,"freq":string,"days":number,' +
            '"warnings":[string]}],"transcription":string,"notes":string}. days=0 if unstated. warnings = ' +
            "any return-if/watch-for signs mentioned on the sheet. transcription = a full readable " +
            "transcription of the document, with every patient-identifying line (name, NHS number, date of " +
            'birth, address) replaced by "[patient details removed]", and every clinician/prescriber name, ' +
            'signature, and registration number (e.g. GMC) replaced by "[clinician details removed]". DO NOT ' +
            "include any person's name — patient or staff — NHS number, date of birth, address, or any other " +
            "identifying detail anywhere in the output. If no " +
            'medication is legible, return {"medications":[],"transcription":"","notes":"<why>"}.',
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the medication schedule from this document." },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ],
        },
      ],
    }),
    LLM_TIMEOUT_MS,
    "OpenAI vision extraction"
  );
  const parsed = parseJson<RawExtraction>(res.choices[0]?.message?.content ?? "", "Vision extraction");
  if (!Array.isArray(parsed.medications)) throw new Error("Vision extraction returned no medications array");
  return parsed;
}

// Regex scrub for identifiers leaking into free-text fields. The vision model
// is INSTRUCTED to redact, but a safety claim can't rest on an instruction —
// these run deterministically on top: NHS-number shapes, dates, GMC numbers,
// and clinician names in their structural positions on a prescription.
export function scrubText(s: string): string {
  return s
    .replace(/\b\d{3}[ -]?\d{3}[ -]?\d{4}\b/g, "[removed]") // NHS number shape
    .replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-](?:19|20)\d{2}\b/g, "[removed]") // dates e.g. DOB
    .replace(/\(\s*gmc[^)]*\)/gi, "(GMC [removed])")
    .replace(/\b(prescriber|signed|signature|clinician|doctor|gp)\s*:\s*[^\n(]+/gi, "$1: [clinician details removed] ")
    .replace(/\b[Dd]r\.?\s+(?:[A-Z]\.?\s*)*[A-Z][\w'’-]+/g, "[clinician details removed]")
    .trim();
}

// STEP 2 — Strip PII. Structural guarantee first: only whitelisted medication
// fields survive, so a name on the sheet cannot travel onward. Regex scrub on
// top catches identifiers leaking into free-text fields.
export function stripPii(raw: RawExtraction): (ExtractedMedication & { warnings?: string[] })[] {
  const scrub = scrubText;
  return raw.medications
    .filter((m) => m.drug?.trim())
    .map((m) => ({
      drug: scrub(String(m.drug)),
      dose: scrub(String(m.dose ?? "")),
      freq: scrub(String(m.freq ?? "")),
      days: Number.isFinite(Number(m.days)) ? Number(m.days) : 0,
      ...(m.warnings?.length ? { warnings: m.warnings.map((w) => scrub(String(w))) } : {}),
    }));
}

// STEP 3 — Structure cleanup via Pioneer (OpenAI-compatible endpoint).
// Best-effort by design: skipped gracefully when unconfigured, and any error
// falls back to the input untouched — never blocks the chain. A hard account
// error (e.g. billing not enabled) trips a breaker so later jobs skip the
// round trip instead of re-failing on every run.
let pioneerDisabled: string | null = null;

export async function structureCleanup(
  extracted: (ExtractedMedication & { warnings?: string[] })[]
): Promise<(ExtractedMedication & { warnings?: string[] })[]> {
  const key = process.env.PIONEER_API_KEY;
  const model = process.env.PIONEER_GLINER_MODEL;
  if (!key || !model) {
    console.log("[prepipeline] Pioneer structuring skipped (PIONEER_API_KEY/PIONEER_GLINER_MODEL not set)");
    return extracted;
  }
  if (pioneerDisabled) {
    console.log(`[prepipeline] Pioneer structuring skipped (disabled this session: ${pioneerDisabled})`);
    return extracted;
  }
  try {
    const pioneer = new OpenAI({ apiKey: key, baseURL: process.env.PIONEER_BASE_URL ?? "https://api.pioneer.ai/v1" });
    const res = await withTimeout(
      pioneer.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content:
              "Normalize this medication extraction. Fix obvious OCR slips in drug names, standardise dose " +
              'units (e.g. "500 mg"->"500mg"), keep freq codes as-is. Return ONLY the corrected JSON array, ' +
              "same shape:\n" + JSON.stringify(extracted),
          },
        ],
      }),
      LLM_TIMEOUT_MS,
      "Pioneer structuring"
    );
    const cleaned = parseJson<(ExtractedMedication & { warnings?: string[] })[]>(
      res.choices[0]?.message?.content ?? "",
      "Pioneer structuring"
    );
    return Array.isArray(cleaned) && cleaned.length > 0 ? cleaned : extracted;
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    if (/payment|billing|permission/i.test(message)) pioneerDisabled = message.slice(0, 80);
    console.warn(`[prepipeline] Pioneer structuring failed (${message}) — using raw extraction`);
    return extracted;
  }
}

// Hard ceiling on spoken length: render time scales with audio duration, and
// a patient stops absorbing a spoken list after half a minute anyway. At a
// normal speaking pace (~2.5 words/sec) 75 words is about 30 seconds — the
// cap applies no matter how many medicines are on the sheet.
const MAX_SPOKEN_SECONDS = Number(process.env.MAX_SPOKEN_SECONDS ?? 30);
const WORDS_PER_SECOND = 2.5;
const MAX_SCRIPT_WORDS = Math.round(MAX_SPOKEN_SECONDS * WORDS_PER_SECOND);

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// STEP 4 — Plain-language script (English), ~20-45 seconds spoken.
export async function writePlainScript(
  extracted: (ExtractedMedication & { warnings?: string[] })[]
): Promise<string> {
  if (extracted.length === 0) throw new Error("No medications extracted — nothing to write a script for.");
  if (mockMode()) {
    await sleep(300);
    return mockPlainScript;
  }

  const budget = MAX_SCRIPT_WORDS;

  const res = await withTimeout(
    openai().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You write short spoken scripts explaining medication instructions to patients. Plain language at " +
            'a sixth-grade reading level — "take one capsule three times a day with food", never "TDS PO". ' +
            `HARD LIMIT: ${budget} words in total, about ${MAX_SPOKEN_SECONDS} seconds spoken. This is the ` +
            "whole script even if there are several medicines, so be brief: for each medicine give only how " +
            "much, how often, and for how long (say to finish the course if it is an antibiotic). Name what " +
            "the medicine is for in two or three words at most, and only if it fits. End with ONE short " +
            "sentence naming the most serious warning signs across all the medicines — never list every " +
            "side effect. Warm, calm, direct address. No greetings, no sign-off, no patient name. Output " +
            "the script text only.",
        },
        { role: "user", content: JSON.stringify(extracted) },
      ],
    }),
    LLM_TIMEOUT_MS,
    "Plain-script generation"
  );
  const script = res.choices[0]?.message?.content?.trim();
  if (!script) throw new Error("Plain-script generation returned nothing");

  return condenseScript(script, budget);
}

/**
 * Enforce the word budget the model was asked for. Dose, frequency and
 * duration are never dropped — only the warning list is compressed — because
 * a shortened script must still be a correct one.
 */
export async function condenseScript(script: string, budget = MAX_SCRIPT_WORDS): Promise<string> {
  if (mockMode()) return script;

  let current = script;

  // Two passes: the first keeps warnings in reduced form, the second strips
  // them to the single most serious one. Dose, frequency and duration are
  // never droppable — a sheet with several medicines has a floor below which
  // the script cannot go, and correctness beats the cap.
  for (let pass = 1; pass <= 2 && wordCount(current) > budget; pass++) {
    console.log(`[prepipeline] script ${wordCount(current)} words > budget ${budget} — condense pass ${pass}`);
    const res = await withTimeout(
      openai().chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              `Shorten this spoken patient script to ${budget} words or fewer. You MUST keep every drug name, ` +
              "dose, frequency, timing and duration exactly as written — never drop or merge a medicine. " +
              "You MUST also keep the return-advice that came from the prescription itself (the signs the " +
              "sheet says to come back for) — drop leaflet-sourced side effects before ever dropping those. " +
              (pass === 1
                ? "Compress the warning signs, keeping the sheet's own and the most serious others. "
                : "Cut the warnings down to ONE short closing sentence — the sheet's own return-advice if it " +
                  "has any. Use telegraphic phrasing where it still reads naturally. ") +
              "Keep the plain sixth-grade tone. Output the script only.",
          },
          { role: "user", content: current },
        ],
      }),
      LLM_TIMEOUT_MS,
      "Script condensing"
    );
    const shortened = res.choices[0]?.message?.content?.trim();
    if (!shortened || wordCount(shortened) >= wordCount(current)) break;
    current = shortened;
  }

  if (wordCount(current) > budget) {
    console.log(
      `[prepipeline] script settled at ${wordCount(current)} words (~${Math.round(wordCount(current) / 2.5)}s) ` +
        `— above the ${budget}-word target, but every dose is preserved`
    );
  }
  return current;
}

export interface GroundingNote {
  drug: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
}

// STEP 5 — Ground with Tavily: fetch the official patient information leaflet
// per drug, then align the script's claims with it. Never fabricate: a drug
// with no solid source keeps a generic-but-accurate description.
// Tavily keys tried in order; on an auth/quota response the next key takes
// over for the rest of the session.
let tavilyKeyIndex = 0;

async function tavilySearch(query: string): Promise<{ results?: { title: string; url: string; content: string }[] }> {
  const keys = [process.env.TAVILY_API_KEY, process.env.TAVILY_API_KEY_2].filter((k): k is string => Boolean(k));
  if (keys.length === 0) throw new Error("TAVILY_API_KEY not set");
  for (;;) {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: keys[tavilyKeyIndex], query, search_depth: "basic", max_results: 3 }),
    });
    if (!r.ok) {
      if ([401, 402, 403, 429, 432].includes(r.status) && tavilyKeyIndex < keys.length - 1) {
        tavilyKeyIndex += 1;
        console.warn(`[prepipeline] Tavily key ${tavilyKeyIndex + 1}/${keys.length} taking over (HTTP ${r.status})`);
        continue;
      }
      throw new Error(`Tavily HTTP ${r.status}`);
    }
    return (await r.json()) as { results?: { title: string; url: string; content: string }[] };
  }
}

export async function groundAndRefine(
  extracted: (ExtractedMedication & { warnings?: string[] })[],
  plainScript: string
): Promise<{ plainScript: string; groundingNotes: GroundingNote[] }> {
  if (mockMode()) {
    await sleep(300);
    return {
      plainScript,
      groundingNotes: extracted.map((m) => ({
        drug: m.drug,
        sourceUrl: "https://www.medicines.org.uk/emc (mock)",
        sourceTitle: `${m.drug} patient information leaflet (mock)`,
      })),
    };
  }
  if (!process.env.TAVILY_API_KEY && !process.env.TAVILY_API_KEY_2) {
    console.warn("[prepipeline] TAVILY_API_KEY not set — skipping grounding");
    return { plainScript, groundingNotes: extracted.map((m) => ({ drug: m.drug, sourceUrl: null, sourceTitle: null })) };
  }

  const groundingNotes: GroundingNote[] = [];
  const snippets: string[] = [];
  for (const med of extracted) {
    try {
      const res = await withTimeout(
        tavilySearch(`${med.drug} patient information leaflet what it is for warnings side effects`),
        30_000,
        `Tavily search (${med.drug})`
      );
      const top = res.results?.[0];
      groundingNotes.push({ drug: med.drug, sourceUrl: top?.url ?? null, sourceTitle: top?.title ?? null });
      for (const r of res.results ?? []) snippets.push(`[${med.drug}] ${r.title} (${r.url}): ${r.content.slice(0, 500)}`);
    } catch (err) {
      console.warn(`[prepipeline] Tavily failed for ${med.drug} (${(err as Error).message}) — script stays un-grounded for it`);
      groundingNotes.push({ drug: med.drug, sourceUrl: null, sourceTitle: null });
    }
  }

  if (snippets.length === 0) return { plainScript, groundingNotes };

  const res = await withTimeout(
    openai().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "Revise this patient script ONLY where the sourced leaflet excerpts contradict it or supply a " +
            "clearly better what-it's-for / warning-sign detail. Claims must be traceable to the excerpts — " +
            "if the excerpts don't support a claim about a drug, keep it generic and accurate rather than " +
            "specific and invented. Keep dose, frequency and duration EXACTLY as in the original script. Any " +
            "warning or return-advice already in the script came from the prescription sheet itself and MUST " +
            "stay — excerpts may add warnings, never replace the sheet's own. Keep the same length and plain " +
            "sixth-grade tone. Output the revised script text only.",
        },
        { role: "user", content: `SCRIPT:\n${plainScript}\n\nSOURCED EXCERPTS:\n${snippets.join("\n")}` },
      ],
    }),
    LLM_TIMEOUT_MS,
    "Grounded refinement"
  );
  return { plainScript: res.choices[0]?.message?.content?.trim() || plainScript, groundingNotes };
}

// STEP 6 — Translate, back-translate, flag. The safety-critical step: the
// back-translation is how a clinician who doesn't speak the language verifies
// no dose was corrupted, and the flags point them at exactly those terms.
export async function translateAndVerify(
  plainScript: string,
  targetLanguage: string
): Promise<{ translation: string; backTranslation: string; flags: Flag[] }> {
  if (mockMode()) {
    await sleep(400);
    return mockTranslate(targetLanguage);
  }

  const langName = ALLOWED_LANGUAGES[targetLanguage];
  if (!langName) {
    throw new Error(`Language "${targetLanguage}" not allowed (hardcoded two: ${Object.keys(ALLOWED_LANGUAGES).join(", ")})`);
  }
  const client = openai();

  const t = await withTimeout(
    client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            `Translate this spoken patient script into ${langName}. Natural spoken register a patient would ` +
            "understand, not formal-document register. Numbers, doses, frequencies and durations must be " +
            "preserved exactly. Output the translation only.",
        },
        { role: "user", content: plainScript },
      ],
    }),
    LLM_TIMEOUT_MS,
    "Translation"
  );
  const translation = t.choices[0]?.message?.content?.trim();
  if (!translation) throw new Error("Translation returned nothing");

  return verifyTranslation(plainScript, translation, targetLanguage);
}

// The verification half on its own — also used when the clinician edits the
// translation (or script) directly on the approval screen: whatever text will
// actually be spoken gets a fresh round trip and fresh flags before approval.
export async function verifyTranslation(
  plainScript: string,
  translation: string,
  targetLanguage: string
): Promise<{ translation: string; backTranslation: string; flags: Flag[] }> {
  if (mockMode()) {
    await sleep(400);
    return { ...mockTranslate(targetLanguage), translation };
  }

  const langName = ALLOWED_LANGUAGES[targetLanguage];
  if (!langName) {
    throw new Error(`Language "${targetLanguage}" not allowed (hardcoded two: ${Object.keys(ALLOWED_LANGUAGES).join(", ")})`);
  }
  const client = openai();

  // Independent round trip — the back-translator never sees the original.
  const bt = await withTimeout(
    client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Translate this ${langName} text into English, literally and faithfully. Output the English only.`,
        },
        { role: "user", content: translation },
      ],
    }),
    LLM_TIMEOUT_MS,
    "Back-translation"
  );
  const backTranslation = bt.choices[0]?.message?.content?.trim();
  if (!backTranslation) throw new Error("Back-translation returned nothing");

  const f = await withTimeout(
    client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Compare an original patient script with its round-trip back-translation. For every safety-critical " +
            "term in the original (each drug name, dosage amount, frequency, duration, and warning sign), score " +
            "how faithfully its meaning survived the round trip: 1.0 = identical meaning, below 0.7 = meaning " +
            'diverged and a clinician must check it. Return JSON {"flags":[{"term":string,"kind":"drug"|"dosage"|' +
            '"frequency"|"duration"|"warning","confidence":number}]} covering ALL such terms, diverged or not. ' +
            "Each term MUST be copied character-for-character from the ORIGINAL script — an exact verbatim " +
            "substring, never paraphrased, re-spelled, or reworded.",
        },
        { role: "user", content: `ORIGINAL:\n${plainScript}\n\nBACK-TRANSLATION:\n${backTranslation}` },
      ],
    }),
    LLM_TIMEOUT_MS,
    "Divergence flagging"
  );
  const rawFlags = parseJson<{ flags: Flag[] }>(f.choices[0]?.message?.content ?? "", "Divergence flagging").flags ?? [];

  // Anchor every term to the script's exact wording so A's approval screen can
  // highlight it — the model occasionally re-spells despite the instruction.
  const seen = new Set<string>();
  const flags = rawFlags
    .map((f) => {
      const idx = plainScript.toLowerCase().indexOf(f.term.toLowerCase());
      return idx >= 0 ? { ...f, term: plainScript.slice(idx, idx + f.term.length) } : f;
    })
    .filter((f) => {
      const key = `${f.kind}|${f.term.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return { translation, backTranslation, flags };
}
