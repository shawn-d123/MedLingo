import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export async function download(url: string, filePath: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, buffer);
  return buffer.length;
}

export function saveText(text: string, filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, "utf8");
}
