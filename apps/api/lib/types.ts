// THE JOB OBJECT — the one contract A, B and C all build against.
// Nobody changes this shape without telling the other two.

export type JobStatus =
  | "reading"
  | "grounding"
  | "awaiting_approval"
  | "synthesizing"
  | "done"
  | "failed";

export interface ExtractedMedication {
  drug: string;
  dose: string;
  freq: string;
  days: number;
  /** Free-text directions for this medicine — prescriptions rarely fit four fields. */
  notes?: string;
  warnings?: string[];
}

/** Fields the clinician can edit on the approval screen (A's UI sends these
 * to /approve and /recheck). Script or translation edits force re-verification
 * before anything is approved. */
export interface EditedFields {
  extracted?: ExtractedMedication[];
  transcription?: string;
  plainScript?: string;
  translation?: string;
}

export interface Flag {
  term: string;
  kind: "dosage" | "frequency" | "duration" | "warning" | "drug";
  confidence: number;
}

export interface Job {
  id: string;
  status: JobStatus;
  sourceImageUrl: string | null;
  targetLanguage: string; // e.g. "ur", "pl" — captured at intake, alongside the photo
  extracted: ExtractedMedication[];
  /** Full readable transcription of the sheet, PII-stripped. Shown/editable on A's approval screen. */
  transcription?: string;
  plainScript: string;
  translation: string; // the APPROVED translation — this is what the presenter speaks
  backTranslation: string;
  flags: Flag[];
  approvedAt: string | null; // Person C's pipeline must NEVER run before this is set
  audioUrl: string | null; // written by Person C only
  outputVideoUrl: string | null; // written by Person C only
  error: string | null;
  /** Fal queue id for the Fabric render, so a slow video is never lost. */
  falRequestId?: string | null;
  // Person C addition (additive, optional — flagged to A & B in the README):
  // English WebVTT subtitles for the result player, served at GET /api/jobs/:id/subtitles
  subtitlesVtt?: string | null;
}
