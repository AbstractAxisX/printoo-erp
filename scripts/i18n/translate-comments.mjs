// PHASE 27 — translate COMMENT strings (Excel-only; never enters runtime dicts)
// Output: scripts/i18n/comment-translations.json
import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";
import path from "node:path";

const DIR = "/home/z/my-project/scripts/i18n";
const OCC = JSON.parse(fs.readFileSync(path.join(DIR, "occurrences.json"), "utf8"));
const OUT = path.join(DIR, "comment-translations.json");
const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};

const commentKeys = [...new Set(OCC.filter((o) => o["type"] === "comment").map((o) => o["key"] || o["text"]))];
const pending = commentKeys.filter((k) => !(k in existing));
console.log(`comments: ${commentKeys.length} unique, pending ${pending.length}`);

const SYSTEM = `You are a professional Persian→English translator. These are CODE COMMENTS from "Printoo24 ERP" (a Persian print-shop management platform). Translate each comment to natural, concise English.
Rules:
1. Respond with ONE strict JSON object: each EXACT input key → English translation. No commentary.
2. Keys are Persian code comments (may mention identifiers like lib/auth.ts, Phase 23, prisma, Tailwind — keep technical tokens verbatim).
3. Translate MEANING, keep it brief — these are developer notes.`;

function placeholders(s) { return new Set(s.match(/\{p\d+\}/g) ?? []); }

function validate(chunk, obj) {
  const valid = {}, invalid = [];
  if (typeof obj !== "object" || obj === null) return { valid, invalid: chunk.map((k) => ({ key: k, err: "not object" })) };
  for (const k of chunk) {
    const v = obj[k];
    if (typeof v !== "string" || !v.trim()) { invalid.push({ key: k, err: "missing" }); continue; }
    valid[k] = v;
  }
  return { valid, invalid };
}

const chunks = [];
let cur = [], chars = 0;
for (const k of pending) {
  const w = k.length + 60;
  if (cur.length >= 40 || (chars + w > 2400 && cur.length)) { chunks.push(cur); cur = []; chars = 0; }
  cur.push(k); chars += w;
}
if (cur.length) chunks.push(cur);

async function main() {
  const zai = await ZAI.create();
  let done = 0;
  for (const chunk of chunks) {
    let ok = false;
    for (let attempt = 1; attempt <= 5 && !ok; attempt++) {
      try {
        const completion = await zai.chat.completions.create({
          messages: [
            { role: "assistant", content: SYSTEM },
            { role: "user", content: `Input array of Persian comments:\n${JSON.stringify(chunk, null, 1)}\n\nReturn ONE JSON object: EXACT same keys → English translations.\nExample — input ["// ذخیره شود"] → {"// ذخیره شود": "// shall be saved"}` },
          ],
          thinking: { type: "disabled" },
        });
        const raw = (completion.choices[0]?.message?.content ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
        const obj = JSON.parse(raw);
        const { valid, invalid } = validate(chunk, obj);
        if (Object.keys(valid).length === 0) throw new Error("empty valid");
        Object.assign(existing, valid);
        fs.writeFileSync(OUT, JSON.stringify(existing, null, 1), "utf8");
        done += Object.keys(valid).length;
        console.log(`✓ ${done}/${pending.length} (invalid ${invalid.length})`);
        ok = true;
        await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        const is429 = String(e.message || e).includes("429");
        console.log(`attempt ${attempt} failed: ${String(e.message || e).slice(0, 80)}`);
        await new Promise((r) => setTimeout(r, is429 ? 45000 : 4000 * attempt));
      }
    }
  }
  console.log(`DONE comments: ${done}/${pending.length}`);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
