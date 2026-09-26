// PHASE 27 — bilingual i18n core (English default / فارسی selectable).
//
// ── Natural-key mechanism ────────────────────────────────────────────────
// The translation key IS the source string. Legacy strings are Persian
// (the app was Persian-only), so:
//   en mode → DICT_EN[faKey] ?? faKey   (Persian key → English)
//   fa mode → DICT_FA[enKey] ?? enKey   (English key → Persian)
// New code MUST author UI text in ENGLISH and add a fa entry to
// scripts/i18n/extra-translations.json (see I18N_RULES.md at the repo
// root — MANDATORY reading before writing any user-visible string).
//
// ── Server safety ────────────────────────────────────────────────────────
// t() returns the key unchanged on the server (typeof window check).
// The whole app content renders client-side (page.tsx gates rendering
// behind a session check), so this guarantees zero behavioral change for
// any server-side import — no hydration mismatches are possible.
//
// ── Dynamic values ───────────────────────────────────────────────────────
// t() also translates RUNTIME values (DB rows like order status labels),
// which is exactly why natural keys were chosen:
//     <Badge>{t(order.statusLabel)}</Badge>   // works for any Persian value
//
// ── Params ───────────────────────────────────────────────────────────────
//   t("Order {p0} saved", { p0: order.id })
// Placeholders are {pN} (generated from template literals).

import { DICT_EN } from "./dict-en";
import { DICT_FA } from "./dict-fa";

export type Lang = "en" | "fa";

const LANG_STORAGE_KEY = "p24-lang"; // localStorage (client boot)
const LANG_COOKIE = "p24-lang"; // cookie (SSR <html lang/dir> + metadata)

const IS_SERVER = typeof window === "undefined";

let current: Lang = "en";

// Client boot: localStorage wins, cookie fallback, English default.
if (!IS_SERVER) {
  try {
    const v = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (v === "fa" || v === "en") {
      current = v;
    } else {
      const m = document.cookie.match(/(?:^|;\s*)p24-lang=(en|fa)(?:;|$)/);
      if (m) current = m[1] === "fa" ? "fa" : "en";
    }
  } catch {
    /* storage unavailable — stay English */
  }
}

export function getLang(): Lang {
  return current;
}

export function isRTL(): boolean {
  return current === "fa";
}

function writePersistence(lang: Lang) {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

export function setLang(lang: Lang): void {
  current = lang;
  if (IS_SERVER) return;
  writePersistence(lang);
  document.documentElement.lang = lang === "fa" ? "fa" : "en";
  document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
}

/** Translate a UI string (natural key). Safe on any input — never throws. */
export function t(
  key: string,
  params?: Record<string, string | number | undefined | null>
): string {
  if (IS_SERVER) return key; // server: identity — zero server behavior change
  let out: string;
  if (current === "fa") {
    out = DICT_FA[key] ?? key;
  } else {
    out = DICT_EN[key] ?? key;
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}

/**
 * Persian rendering of a key — used where a Persian canonical form is
 * needed regardless of the active language (e.g. guide-tooltip context
 * keys that are built from button text: `module:page|متن دکمه`).
 */
export function tFa(key: string): string {
  if (IS_SERVER) return key;
  return DICT_FA[key] ?? key;
}

/**
 * Apply the profile language after login / session refresh.
 * Persists to localStorage + cookie; hard-reloads when the language
 * actually changed so every already-rendered string flips cleanly.
 */
export function applyUserLanguage(lang: string | null | undefined): void {
  if (IS_SERVER) return;
  const l: Lang = lang === "fa" ? "fa" : "en";
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, l);
  } catch {
    /* ignore */
  }
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  if (current !== l) {
    window.location.reload();
    return;
  }
  document.documentElement.lang = l === "fa" ? "fa" : "en";
  document.documentElement.dir = l === "fa" ? "rtl" : "ltr";
}

/** Names for the language switcher UI (each shown in its own language). */
export const LANGUAGES: { value: Lang; native: string; english: string }[] = [
  { value: "en", native: "English", english: "English" },
  { value: "fa", native: "فارسی", english: "Persian" },
];
