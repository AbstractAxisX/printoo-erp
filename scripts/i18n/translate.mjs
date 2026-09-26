// PHASE 27 — bulk Persian→English translation of the i18n catalog
// via z-ai-web-dev-sdk (backend script; never imported by client code).
//
// Usage:  node scripts/i18n/translate.mjs
// Resume: safe — already-translated keys in translations.json are skipped.
//
// Validation per chunk:
//   - strict JSON object response
//   - every input key answered
//   - {pN} placeholder sets identical in key & translation
//   - no Persian characters in translations
// Failures land in translate-failures.json for manual fixing.

import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";
import path from "node:path";

const DIR = "/home/z/my-project/scripts/i18n";
const CATALOG = JSON.parse(fs.readFileSync(path.join(DIR, "catalog.json"), "utf8")).strings;
const OCC = JSON.parse(fs.readFileSync(path.join(DIR, "occurrences.json"), "utf8"));
const OUT = path.join(DIR, "translations.json");
const FAIL = path.join(DIR, "translate-failures.json");

const PERSIAN_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

// ── collect keys to translate: non-comment only ─────────────────────────
const commentKeys = new Set(OCC.filter((o) => o["type"] === "comment").map((o) => o["key"]));
let keys = Object.keys(CATALOG).filter((k) => !commentKeys.has(k));
// PHASE 27 addendum: keys created by replacement passes AFTER extraction
const MISSING_PATH = path.join(DIR, "missing-keys.json");
if (fs.existsSync(MISSING_PATH)) {
  const extra = JSON.parse(fs.readFileSync(MISSING_PATH, "utf8"));
  keys = [...new Set([...keys, ...extra])];
  console.log(`+ ${extra.length} late keys from missing-keys.json`);
}

const existing = fs.existsSync(OUT)
  ? JSON.parse(fs.readFileSync(OUT, "utf8"))
  : {};
const results = { ...existing };

// type hint per key (dominant non-comment type)
const typeHint = {};
for (const o of OCC) {
  if (o["type"] === "comment") continue;
  const k = o["key"];
  const t = o["type"] || "literal";
  if (!typeHint[k] || CATALOG[k]?.types?.[t] > (typeHint[k].count ?? 0)) {
    typeHint[k] = { type: t, count: (CATALOG[k]?.types?.[t] ?? 1) };
  }
}

const pending = keys.filter((k) => !(k in results));
console.log(`total=${keys.length} already=${keys.length - pending.length} pending=${pending.length}`);

// ── chunking: char-budget based ──────────────────────────────────────────
const CHUNK_CHAR_BUDGET = 2600;
const CHUNK_MAX_KEYS = 45;
const chunks = [];
let cur = [];
let curChars = 0;
for (const k of pending) {
  const w = k.length + 60;
  if (cur.length >= CHUNK_MAX_KEYS || (curChars + w > CHUNK_CHAR_BUDGET && cur.length > 0)) {
    chunks.push(cur);
    cur = [];
    curChars = 0;
  }
  cur.push(k);
  curChars += w;
}
if (cur.length) chunks.push(cur);
console.log(`chunks: ${chunks.length}`);

// ── glossary for ERP consistency ─────────────────────────────────────────
const SYSTEM = `You are a professional Persian→English translator for the UI strings of "Printoo24 ERP" — a print-shop management platform (orders, design, printing, warehouse, finance, payroll, CRM, SRM, QC).

Glossary (use EXACTLY these renderings for consistency):
سفارش=Order | پیش‌فاکتور=Proforma Invoice | فاکتور=Invoice | مشتری=Customer | تامین‌کننده=Supplier | انبار=Warehouse | حقوق=Payroll | مساعده=Advance (payroll) | هزینه=Cost | درآمد=Revenue | بدهی=Debt | تسویه=Settlement | نرخ ارز=Exchange rate | دینار=IQD | دلار (USD)=USD | تومان=Toman | چاپ=Print | طراحی=Design | کنترل کیفی=QC | ادمین=Admin | کاربر=User | نقش=Role | ماژول=Module | سایدبار=Sidebar | تب=Tab | داشبورد=Dashboard | تقویم=Calendar | مرخصی=Leave | حضور=Attendance | بسته=Package | ارسال=Shipment/Delivery | لجستیک=Logistics | قلم/آیتم=Item | محصول=Product | قیمت=Price | مبلغ=Amount | باقی‌مانده=Remaining balance | تحویل=Delivery | وضعیت=Status | اعلان=Notification | یادداشت=Note | برچسب=Label | جستجو=Search | فیلتر=Filter | ذخیره=Save | حذف=Delete | ویرایش=Edit | افزودن=Add | ثبت=Save/Record | لغو=Cancel | تایید=Approve | رد=Reject | آرشیو=Archive

Hard rules:
1. Respond with ONE strict JSON object: each EXACT input key → English translation. No commentary, no markdown fences.
2. Preserve placeholders {p0} {p1} … EXACTLY — same names, same count, same positions where sensible.
3. Keep verbatim: Printoo24, IQD, USD, IRT, CRM, SRM, QC, TGJU, LIVE/MANUAL, emails, #numbers, digits, code tokens, "—" em-dashes.
4. Placeholders look like {p0} {p1} — copy them VERBATIM into the translation at the natural position (e.g. "جستجو: «{p0}»" → "Search: “{p0}"").
5. Style: labels/buttons/table headers → Title Case; sentences/toasts/errors → concise professional sentence English.
6. Translate MEANING naturally, not word-by-word. Short is better for UI.
7. Mixed Persian+English strings: translate only the Persian part.
8. NEVER output Persian/Arabic script in values.`;

async function translateChunk(zai, chunk, attempt) {
  const input = {};
  for (const k of chunk) {
    const hint = typeHint[k]?.type ?? "literal";
    input[k] = hint;
  }
  const user = `Input — an array of Persian UI strings:\n${JSON.stringify(chunk, null, 1)}\n\nReturn ONE JSON object whose KEYS are the EXACT SAME Persian strings from the array (copied verbatim, unchanged) and whose VALUES are their English translations.\nExample — input [\"ذخیره\", \"{p0} روز\"] → output {\"ذخیره\": \"Save\", \"{p0} روز\": \"{p0} days\"}.\nUsage hints per string: ${JSON.stringify(input)}`;

  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: SYSTEM },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  // strip potential markdown fences
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let obj;
  try {
    obj = JSON.parse(cleaned);
  } catch (e) {
    return { __parseError: true, __raw: raw.slice(0, 300) };
  }
  return { __obj: obj, __raw: raw.slice(0, 300) };
}

function placeholders(s) {
  return new Set((s.match(/\{p\d+\}/g) ?? []));
}

function validate(chunk, obj) {
  const valid = {};
  const invalid = [];
  if (typeof obj !== "object" || obj === null) {
    return { valid, invalid: chunk.map((k) => ({ key: k, err: "not an object" })) };
  }
  for (const k of chunk) {
    const v = obj[k];
    if (typeof v !== "string" || !v.trim()) {
      invalid.push({ key: k, err: "missing/empty" });
      continue;
    }
    if (PERSIAN_RE.test(v)) {
      invalid.push({ key: k, err: `persian in value: ${v.slice(0, 60)}` });
      continue;
    }
    const kp = placeholders(k);
    const vp = placeholders(v);
    if (kp.size !== vp.size || [...kp].some((p) => !vp.has(p))) {
      invalid.push({ key: k, err: `placeholder mismatch -> ${v.slice(0, 60)}` });
      continue;
    }
    valid[k] = v;
  }
  return { valid, invalid };
}

// ── runner with small concurrency pool ───────────────────────────────────
const CONCURRENCY = 1;
const MAX_ATTEMPTS = 6;
const failures = [];

async function worker(zai, queue, wid) {
  while (queue.length) {
    const chunk = queue.shift();
    if (!chunk) return;
    let done = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !done; attempt++) {
      try {
        const res = await translateChunk(zai, chunk, attempt);
        if (res.__parseError) {
          console.log(`[w${wid}] PARSE ERROR (attempt ${attempt}): ${res.__raw}`);
          if (attempt === MAX_ATTEMPTS) failures.push({ chunk, errors: ["parse error: " + res.__raw] });
          else await new Promise((r) => setTimeout(r, 3000 * attempt));
          continue;
        }
        const { valid, invalid } = validate(chunk, res.__obj);
        const rawHead = res.__raw.slice(0, 200);
        if (Object.keys(valid).length === 0) {
          console.log(`[w${wid}] chunk fully invalid (attempt ${attempt}) — chunk size ${JSON.stringify(chunk).length} chars, first key: ${chunk[0]?.slice(0, 60)}`);
          console.log(`[w${wid}] raw head: ${rawHead}`);
          if (attempt === MAX_ATTEMPTS) {
            failures.push({ chunk, errors: invalid.map((i) => `${i.key}: ${i.err}`) });
          } else {
            await new Promise((r) => setTimeout(r, 3000 * attempt));
          }
          continue;
        }
        let fresh = 0;
        for (const [k, v] of Object.entries(valid)) {
          if (!(k in results)) fresh += 1;
          results[k] = v;
        }
        if (invalid.length) {
          if (attempt < MAX_ATTEMPTS) {
            queue.unshift(invalid.map((i) => i.key));
            console.log(`[w${wid}] ✓ ${fresh} accepted; ${invalid.length} requeued`);
          } else {
            failures.push({ chunk: invalid.map((i) => i.key), errors: invalid.map((i) => `${i.key}: ${i.err}`) });
            console.log(`[w${wid}] ✓ ${fresh} accepted; ${invalid.length} FAILED`);
          }
        } else {
          console.log(`[w${wid}] ✓ chunk done (${chunk.length} keys) — total ${Object.keys(results).length}/${keys.length}`);
        }
        fs.writeFileSync(OUT, JSON.stringify(results, null, 1), "utf8");
        done = true;
        await new Promise((r) => setTimeout(r, 2500)); // pacing to dodge 429
      } catch (e) {
        const msg = String(e.message || e);
        const is429 = msg.includes("429");
        console.log(`[w${wid}] chunk ERROR (attempt ${attempt}): ${msg.slice(0, 100)}`);
        if (attempt === MAX_ATTEMPTS) failures.push({ chunk, errors: [msg.slice(0, 200)] });
        else await new Promise((r) => setTimeout(r, is429 ? 45000 : 3000 * attempt));
      }
    }
  }
}

async function main() {
  const zai = await ZAI.create();
  const queue = [...chunks];
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => worker(zai, queue, i + 1))
  );
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1), "utf8");
  fs.writeFileSync(FAIL, JSON.stringify(failures, null, 1), "utf8");
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDONE in ${secs}s — translated ${Object.keys(results).length}/${keys.length}; failed chunks: ${failures.length}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
