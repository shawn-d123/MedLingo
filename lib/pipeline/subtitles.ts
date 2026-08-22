// English subtitles for the result player — how a judge who doesn't speak the
// target language verifies the video is saying the right thing.
// No ffmpeg on the build machine, so these are WebVTT cues rendered as a
// <track> overlay by the player, not burnt into the MP4.

const WORDS_PER_SECOND = 2.1; // measured-ish TTS pace; close enough for an overlay

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(3).padStart(6, "0");
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s}`;
}

/**
 * Build a WebVTT file from the English plain-language script, pacing cues
 * proportionally to sentence length across the (estimated or known) duration.
 */
export function buildVtt(plainScript: string, totalDurationSec?: number): string {
  const sentences = splitSentences(plainScript);
  if (sentences.length === 0) return "WEBVTT\n";

  const wordCounts = sentences.map((s) => s.split(/\s+/).length);
  const totalWords = wordCounts.reduce((a, b) => a + b, 0);
  const duration = totalDurationSec ?? totalWords / WORDS_PER_SECOND;

  let cursor = 0;
  const cues = sentences.map((sentence, i) => {
    const share = (wordCounts[i] / totalWords) * duration;
    const start = cursor;
    const end = cursor + share;
    cursor = end;
    return `${i + 1}\n${toTimestamp(start)} --> ${toTimestamp(end)}\n${sentence}\n`;
  });

  return `WEBVTT\n\n${cues.join("\n")}`;
}
