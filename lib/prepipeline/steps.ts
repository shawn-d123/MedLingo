// Person B's half — everything BEFORE the approval gate.
// Function names and signatures match the interface B's run.js defined
// (extractFromImage, stripPii, structureCleanup, writePlainScript,
// groundAndRefine, translateAndVerify, ALLOWED_LANGUAGES), so B's own
// lib/pipeline.js implementation can replace this file's internals without
// touching any caller. Reconstructed here because that file wasn't in B's push.

import OpenAI from "openai";
import { withTimeout } from "../pipeline/util";
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
  notes?: string;
}

// STEP 1 — Extract (OpenAI vision). Accepts a data URL or https URL.
export async function extractFromImage(imageUrl: string): Promise<RawExtraction> {
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
            '"warnings":[string]}],"notes":string}. days=0 if unstated. warnings = any return-if/watch-for ' +
            "signs mentioned on the sheet. DO NOT include patient name, NHS number, date of birth, address " +
            "or any other identifying detail anywhere in the output. If no medication is legible, return " +
            '{"medications":[],"notes":"<why>"}.',
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

// STEP 2 — Strip PII. Structural guarantee first: only whitelisted medication
// fields survive, so a name on the sheet cannot travel onward. Regex scrub on
// top catches identifiers leaking into free-text fields (NHS numbers, DOBs).
export function stripPii(raw: RawExtraction): (ExtractedMedication & { warnings?: string[] })[] {
  const scrub = (s: string) =>
    s
      .replace(/\b\d{3}[ -]?\d{3}[ -]?\d{4}\b/g, "[removed]") // NHS number shape
      .replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-](?:19|20)\d{2}\b/g, "[removed]") // dates e.g. DOB
      .trim();

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
// falls back to the input untouched — never blocks the chain.
export async function structureCleanup(
  extracted: (ExtractedMedication & { warnings?: string[] })[]
): Promise<(ExtractedMedication & { warnings?: string[] })[]> {
  const key = process.env.PIONEER_API_KEY;
  const model = process.env.PIONEER_GLINER_MODEL;
  if (!key || !model) {
    console.log("[prepipeline] Pioneer structuring skipped (PIONEER_API_KEY/PIONEER_GLINER_MODEL not set)");
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
    console.warn(`[prepipeline] Pioneer structuring failed (${(err as Error).message}) — using raw extraction`);
    return extracted;
  }
}

// STEP 4 — Plain-language script (English), ~20-30 seconds spoken.
export async function writePlainScript(
  extracted: (ExtractedMedication & { warnings?: string[] })[]
): Promise<string> {
  if (extracted.length === 0) throw new Error("No medications extracted — nothing to write a script for.");
  const res = await withTimeout(
    openai().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You write short spoken scripts explaining medication instructions to patients. Plain language at " +
            'a sixth-grade reading level — "take one capsule three times a day with food", never "TDS PO". ' +
            "20-30 seconds when read aloud (roughly 50-75 words). Cover: what the medicine is (one clause), " +
            "how much, how often and when, for how long (and to finish the course if it is an antibiotic), " +
            "and any warning signs to come back for. Warm, calm, direct address. No greetings, no sign-off, " +
            "no patient name. Output the script text only.",
        },
        { role: "user", content: JSON.stringify(extracted) },
      ],
    }),
    LLM_TIMEOUT_MS,
    "Plain-script generation"
  );
  const script = res.choices[0]?.message?.content?.trim();
  if (!script) throw new Error("Plain-script generation returned nothing");
  return script;
}

export interface GroundingNote {
  drug: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
}

// STEP 5 — Ground with Tavily: fetch the official patient information leaflet
// per drug, then align the script's claims with it. Never fabricate: a drug
// with no solid source keeps a generic-but-accurate description.
export async function groundAndRefine(
  extracted: (ExtractedMedication & { warnings?: string[] })[],
  plainScript: string
): Promise<{ plainScript: string; groundingNotes: GroundingNote[] }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn("[prepipeline] TAVILY_API_KEY not set — skipping grounding");
    return { plainScript, groundingNotes: extracted.map((m) => ({ drug: m.drug, sourceUrl: null, sourceTitle: null })) };
  }

  const groundingNotes: GroundingNote[] = [];
  const snippets: string[] = [];
  for (const med of extracted) {
    try {
      const res = await withTimeout(
        fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query: `${med.drug} patient information leaflet what it is for warnings side effects`,
            search_depth: "basic",
            max_results: 3,
          }),
        }).then(async (r) => {
          if (!r.ok) throw new Error(`Tavily HTTP ${r.status}`);
          return (await r.json()) as { results?: { title: string; url: string; content: string }[] };
        }),
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
            '"frequency"|"duration"|"warning","confidence":number}]} covering ALL such terms, diverged or not.',
        },
        { role: "user", content: `ORIGINAL:\n${plainScript}\n\nBACK-TRANSLATION:\n${backTranslation}` },
      ],
    }),
    LLM_TIMEOUT_MS,
    "Divergence flagging"
  );
  const flags = parseJson<{ flags: Flag[] }>(f.choices[0]?.message?.content ?? "", "Divergence flagging").flags ?? [];

  return { translation, backTranslation, flags };
}
