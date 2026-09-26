# ⚠️ I18N RULES — MANDATORY SYSTEM PROMPT FOR AI DEVELOPERS ⚠️

> **هر هوش مصنوعی / توسعه‌دهنده‌ای که می‌خواهد در این پروژه (Printoo24 ERP) کد بنویسد،
> موظف است این فایل را اول بخواند و قوانین آن را رعایت کند.**
> **Any AI agent or developer contributing to this repo MUST read this file
> first and follow these rules for every user-visible string.**
>
> Phase 27 — bilingual system (English default / فارسی selectable per-profile).

---

## 1. The Golden Rule

**NEVER write a raw user-visible string in UI code.** Every label, button text,
table header, toast, error message, placeholder, tooltip, badge, chart label —
anything a user can READ — must go through the translator:

```tsx
import { t } from "@/lib/i18n";

<Button>{t("Save")}</Button>
```

If you find yourself typing `"متن"` or `"Some text"` directly into JSX, you are
doing it wrong.

## 2. How the mechanism works (`src/lib/i18n/`)

| File | Role |
|---|---|
| `index.ts` | `t()`, `tFa()`, `getLang()`, `setLang()`, `applyUserLanguage()` |
| `dict-en.ts` | Persian key → English value (AUTO-GENERATED — do not hand-edit) |
| `dict-fa.ts` | English key → Persian value (reverse map, AUTO-GENERATED) |

**Natural-key design:** the translation key IS the source string.

- **Legacy code (pre-Phase-27):** source strings are PERSIAN —
  `t("ذخیره")` → "Save" in EN mode, "ذخیره" in FA mode.
- **New code (from now on):** author UI text in **ENGLISH** (the default
  language) and register the Persian rendering:

```jsonc
// scripts/i18n/extra-translations.json  ← the ONLY file you edit by hand
{
  "Save and continue": "ذخیره و ادامه",
  "Order {p0} saved": "سفارش {p0} ذخیره شد"
}
```

then regenerate the dictionaries:

```bash
node scripts/i18n/build-dicts.mjs
```

Until the fa entry exists, the English string shows in both languages —
graceful fallback, never crashes.

## 3. Interpolation

Use `{pN}` placeholders — never concatenate:

```tsx
// ✅ CORRECT
t("Order {p0} saved", { p0: order.number })
t("{p0} of {p1} items", { p0: done, p1: total })

// ❌ WRONG
`سفارش ${order.number} ذخیره شد`
"Order " + order.number + " saved"
```

## 4. Dynamic / runtime values (DB data)

`t()` also translates RUNTIME strings — this is why natural keys were chosen:

```tsx
<Badge>{t(order.statusLabel)}</Badge>   // DB value "تسویه شده" → "Settled"
```

Server APIs keep returning Persian — the client translates at display time.
The single choke-point is `lib/api.ts` (error/message paths already call `t()`).
**When you add a new API route, keep its messages Persian** (server behavior
must not depend on language) and let the client translate.

Known limitation (accepted in Phase 27): server-COMPOSED strings
(e.g. `` `دریافتی جدید: ${x}` `` built server-side) are not exact dictionary
keys and stay Persian in EN mode. Keep such compositions out of hot UI paths;
prefer returning structured data and composing the label client-side with `t()`.

## 5. Server-side safety (READ THIS TWICE)

`t()` returns the key **unchanged on the server** (`typeof window` check).
Consequences:

- Shared libs (`src/lib/**`) may call `t()` — server keeps Persian (identical
  to legacy behavior), client translates.
- **NEVER** wrap values used in DB writes/lookups in server code:
  `where: { name: t("حقوق") }` is a BUG. Only display strings.
- The app renders client-side (page.tsx gates behind session check), so there
  are no hydration mismatches.

## 6. Files that must never get `t()` injected

- `src/app/api/**` — server routes (messages translated client-side).
- `src/proxy.ts` — edge proxy.
- Object keys, `switch` cases, enum values, `===` comparisons — keys/values
  are DATA, not display.
- Comments — never translated.

## 7. Language selection & RTL

- `User.language` (`"en" | "fa"`, default `"en"`) — set via the Language card
  in the Profile page → `PUT /api/auth/preferences { language }`.
- Client persistence: localStorage `p24-lang` + cookie `p24-lang` (1 year).
- `<html lang/dir>` is server-rendered from the cookie (layout.tsx) and
  reconciled pre-paint by `LANG_BOOT_SCRIPT`.
- After switching languages the app hard-reloads once (`applyUserLanguage`) —
  clean re-render, no mixed-language state.
- The login page has its own language toggle (pre-login language choice).

## 8. Charts, dates, numbers

- Dates/numbers were already Latin-digit Gregorian (`en-US`) since Phase 24 —
  keep using `lib/format.ts` helpers; do NOT reintroduce `fa-IR` locales.
- `relativeTime()` (date-fns) is English-only — acceptable (fa users see
  English relative times); if you need Persian relative times, route them
  through `t()` with params.

## 9. Regeneration / tooling (scripts/i18n/)

| Script | Purpose |
|---|---|
| `extract.py` | Scan src → `catalog.json` + `occurrences.json` (complete Persian inventory) |
| `translate.mjs` | LLM bulk translation (chunked, placeholder-validated, resumable) |
| `extra-translations.json` | **manual additions/overrides — edit this one** |
| `build-dicts.mjs` | Merges translations + extras → `dict-en.ts` / `dict-fa.ts` |
| `replace*.py` | The one-time Phase-27 migration passes (do not re-run blindly) |
| `make-xlsx.py` | Full bilingual inventory Excel |

After ANY manual key additions: `node scripts/i18n/build-dicts.mjs`.

## 10. Review checklist for a new feature PR

- [ ] All new user-visible strings pass through `t()` / `tr()` (alias where a
      local `t` identifier exists).
- [ ] New English strings have fa entries in `extra-translations.json`.
- [ ] Placeholders are `{pN}`, passed via the params argument.
- [ ] No `t()` inside `where:` / `data:` / enum values / comparisons.
- [ ] Dictionaries regenerated (`build-dicts.mjs`) and committed.
- [ ] Tested the feature in BOTH languages (profile → Language).

---

*Phase 27 — established 2026-09-26. Owners: printoo24-admin ERP.*
