// Tiny .env.local loader for CLI scripts (Next.js loads it itself; tsx doesn't).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const name of [".env.local", ".env"]) {
  try {
    const content = readFileSync(resolve(process.cwd(), name), "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (line.trim().startsWith("#")) continue;
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, raw] = m;
      if (process.env[key] === undefined) process.env[key] = raw.replace(/^["']|["']$/g, "");
    }
  } catch {
    // file absent is fine
  }
}
