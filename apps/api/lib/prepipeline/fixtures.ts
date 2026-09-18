import type { Flag } from "../types";
import type { RawExtraction } from "./steps";

/**
 * Canned results for MOCK_PIPELINE=1, so the whole product runs end to end
 * with no API keys and no network — for UI work, for a fresh clone, and for
 * the smoke test. The content mirrors what the real pipeline produces from
 * samples/printed-amoxicillin.png.
 */

export const mockExtraction: RawExtraction = {
  medications: [
    {
      drug: "Amoxicillin",
      dose: "500mg",
      freq: "TDS",
      days: 7,
      warnings: [
        "Complete the full course even if feeling better.",
        "If pyrexial or rash develops, return to A&E.",
      ],
    },
  ],
  transcription: [
    "ST. CLERE'S HOSPITAL NHS TRUST",
    "Outpatient Prescription",
    "",
    "Patient: [patient details removed]   NHS No: [removed]   DOB: [removed]",
    "Date: [removed]   Prescriber: [clinician details removed]",
    "",
    "Rx",
    "Amoxicillin 500mg capsules",
    "    1 capsule TDS PO with food  -  7/7",
    "    Complete the full course even if feeling better.",
    "",
    "Return advice: if pyrexial or rash develops, return to A&E.",
  ].join("\n"),
  notes: "mock extraction",
};

export const mockPlainScript =
  "Take one 500mg amoxicillin capsule three times a day with food, for seven days. " +
  "Finish the whole course even if you start to feel better. " +
  "Come back to the hospital straight away if you get a rash or a fever.";

interface MockTranslation {
  translation: string;
  backTranslation: string;
}

const TRANSLATIONS: Record<string, MockTranslation> = {
  ur: {
    translation:
      "دن میں تین بار کھانے کے ساتھ اموکسیسیلن کا ایک پانچ سو ملی گرام کیپسول لیں، سات دن تک۔ " +
      "پورا کورس مکمل کریں چاہے آپ بہتر محسوس کرنے لگیں۔ " +
      "اگر آپ کو دانے نکل آئیں یا بخار ہو تو فوراً ہسپتال واپس آئیں۔",
    backTranslation:
      "Take one 500 mg capsule of amoxicillin three times a day with food, for seven days. " +
      "Complete the full course even if you begin to feel better. " +
      "If you develop a rash or a fever, return to the hospital immediately.",
  },
  pl: {
    translation:
      "Proszę przyjmować jedną kapsułkę amoksycyliny 500 mg trzy razy dziennie z jedzeniem, przez siedem dni. " +
      "Proszę dokończyć całą kurację, nawet jeśli poczują się Państwo lepiej. " +
      "Jeśli pojawi się wysypka lub gorączka, proszę natychmiast wrócić do szpitala.",
    backTranslation:
      "Take one 500 mg capsule of amoxicillin three times a day with food, for seven days. " +
      "Finish the entire course, even if you feel better. " +
      "If a rash or fever appears, return to the hospital immediately.",
  },
};

// One term deliberately scores below 1.0 so the approval screen's
// "check back-translation" path is visible in mock runs too.
const FLAGS: Flag[] = [
  { term: "amoxicillin", kind: "drug", confidence: 1 },
  { term: "500mg", kind: "dosage", confidence: 1 },
  { term: "three times a day", kind: "frequency", confidence: 1 },
  { term: "seven days", kind: "duration", confidence: 1 },
  { term: "rash", kind: "warning", confidence: 1 },
  { term: "fever", kind: "warning", confidence: 0.72 },
];

export function mockTranslate(targetLanguage: string): {
  translation: string;
  backTranslation: string;
  flags: Flag[];
} {
  const t = TRANSLATIONS[targetLanguage] ?? TRANSLATIONS.ur;
  return { ...t, flags: FLAGS.map((f) => ({ ...f })) };
}
