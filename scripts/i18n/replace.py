#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PHASE 27 — automated t() replacement for Printoo24 ERP (client files only).

Server files (src/app/api/**, src/proxy.ts) are NEVER touched: their Persian
messages are translated client-side at the api() choke point (lib/api.ts).

Auto-replace (safe display contexts):
  jsx_text            >متن<            → >{t("متن")}<
  attr:SAFE           label="متن"      → label={t("متن")}
  toast               toast("متن")     → toast(t("متن"))
  error               new Error("متن") → new Error(t("متن"))
  prop:SAFE           label: "متن"     → label: t("متن")
  assign:SAFE         const hint = "…" → const hint = t("…")
  template_param      (toast/error/safe-attr only) → t("… {p0} …", { p0: expr })

Never touched (flagged for manual review in replace-report.json):
  - object keys ("متن": …) and switch cases (… case "متن":)
  - ternary branches (a ? "x" : "y") — the ` : ` after a literal
  - bare literals / templates outside display contexts
  - data-ish prop names (name/value/status/type/…)
  - multi-line template literals
  - comments & console.*

Usage:
  python3 scripts/i18n/replace.py --dry   # report only
  python3 scripts/i18n/replace.py --apply # rewrite files
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import tokenize_lines, mask_line, has_persian, is_server_file, template_to_key  # noqa: E402

ROOT = "/home/z/my-project"
SRC = os.path.join(ROOT, "src")

SAFE_ATTRS = {
    "label", "title", "placeholder", "description", "message", "text",
    "heading", "subtitle", "subheading", "caption", "tooltip", "helperText",
    "emptyText", "confirmText", "cancelText", "okText", "alt", "aria-label",
    "prompt", "error", "success", "warning", "info", "header", "content",
    "children", "empty", "hint", "toast", "labelText", "buttonText",
    "searchPlaceholder", "emptyMessage", "rangeLabel", "docTitle",
    "submitLabel", "doneLabel", "closedLabel", "sub", "subValueLabel", "ariaLabel",
}
SAFE_PROPS = {
    "label", "title", "description", "placeholder", "message", "text",
    "heading", "subtitle", "subheading", "caption", "tooltip", "helperText",
    "emptyText", "confirmText", "cancelText", "okText", "error", "success",
    "warning", "info", "header", "content", "prompt", "hint", "note",
    "empty", "suffix", "prefix", "toast", "emptyHint", "tagline",
    "faLabel", "fa", "faName", "unit", "reason",
    # enum-keyed display maps — the VALUE is a Persian label, the key is the
    # enum (never sent anywhere). e.g. { pending: "در انتظار", approved: "تأیید" }
    "pending", "approved", "rejected", "reviewing", "completed", "archived",
    "cancelled", "packing", "ready", "sent", "delivered", "todo", "in_progress",
    "done", "lead", "qualified", "proposal", "negotiation", "won", "lost",
    "cash", "transfer", "cheque", "online", "other", "referral", "phone",
    "pending_design", "in_printing", "warehouse_logistics", "material",
    "logistics", "design", "print", "warehouse", "finance", "qc", "crm",
    "srm", "designer", "admin", "sub", "short", "closedLabel",
}
SAFE_ASSIGNS = {
    "label", "title", "text", "msg", "message", "description", "placeholder",
    "heading", "hint", "emptyText", "tooltip", "caption", "subtitle", "note",
    "error", "warning", "success", "info",
}
# display-maps keyed by enum — wrapping the VALUE keeps the key intact
PROP_VALUE_OK = SAFE_PROPS

PRE_ATTR = re.compile(r"([A-Za-z_][\w-]*)\s*=\s*$")
PRE_PROP = re.compile(r"([A-Za-z_]\w*)\s*:\s*$")
PRE_ASSIGN = re.compile(r"(?:const|let|var)?\s*([A-Za-z_]\w*)\s*=\s*$")
PRE_TOAST = re.compile(r"toast(?:\.(?:success|error|warning|info|loading|custom|message))?\(\s*$")
PRE_ERROR = re.compile(r"(?:new\s+)?Error\(\s*$")
ALREADY_T = re.compile(r"(?:tr|t)\(\s*$")
ENTITIES = re.compile(r"&[a-zA-Z]+;|\{|\}")
# markers that make a line a data/payload context — never auto-wrap there
PAYLOAD_MARKERS = ("api(", "fetch(", "JSON.stringify", "body:", "where", "===", "!==", "case ")

def is_component_file(rel: str) -> bool:
    return rel.startswith("components/") or rel.startswith("stores/") or rel.startswith("hooks/") or rel == "app/page.tsx"

def jdump(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)

def process_file(path: str, rel: str, apply: bool):
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    is_tsx = rel.endswith(".tsx")
    edits = []          # (lineno, start, end, replacement)
    flags = []          # manual-review items
    changed = False

    for lineno, line, tokens in tokenize_lines(lines):
        for tok in tokens:
            kind, text, col = tok[0], tok[1], tok[2]
            if kind != "string" and kind != "template":
                continue
            if not has_persian(text):
                continue
            if "\n" in text:
                flags.append(dict(file=rel, line=lineno, type="multiline_template", text=text[:120]))
                continue
            before = line[:col].rstrip()
            after = line[col + len(text) + 2:] if kind == "string" else line[col + len(text) + 2:]
            # already wrapped?
            if ALREADY_T.search(before[-6:]):
                continue
            # object key or switch case?  ("متن": value  /  case "متن":)
            # NB: a bare " :" AFTER a token is also the ternary false-branch —
            # only treat as key when a word: directly precedes the token.
            if re.match(r"\s*:", after) and not before.endswith("?"):
                flags.append(dict(file=rel, line=lineno, type="object_key_or_case", text=text[:80]))
                continue

            if kind == "string":
                # ── attribute? (JSX attrs attach the quote: label="…") ──
                m = PRE_ATTR.search(before[-60:])
                if m and is_tsx and col > 0 and line[:col].endswith("="):
                    attr = m.group(1)
                    if attr in SAFE_ATTRS and not ENTITIES.search(text):
                        start, end = col, col + len(text) + 2
                        edits.append((lineno, start, end, f"{{t({jdump(text)})}}"))
                        continue
                    flags.append(dict(file=rel, line=lineno, type=f"attr_unsafe:{attr}", text=text[:80]))
                    continue
                # ── spaced '=' → function-parameter default / assignment ──
                m2 = PRE_ATTR.search(before[-60:])
                if m2 and (m2.group(1) in SAFE_ATTRS or m2.group(1) in SAFE_ASSIGNS):
                    edits.append((lineno, col, col + len(text) + 2, f"t({jdump(text)})"))
                    continue
                # ── toast / error? ──
                if PRE_TOAST.search(before[-40:]) or PRE_ERROR.search(before[-30:]):
                    edits.append((lineno, col, col + len(text) + 2, f"t({jdump(text)})"))
                    continue
                # ── object prop value? ──
                m = PRE_PROP.search(before[-60:])
                if m:
                    prop = m.group(1)
                    if prop in PROP_VALUE_OK:
                        edits.append((lineno, col, col + len(text) + 2, f"t({jdump(text)})"))
                        continue
                    flags.append(dict(file=rel, line=lineno, type=f"prop_unsafe:{prop}", text=text[:80]))
                    continue
                # ── assignment? ──
                m = PRE_ASSIGN.search(before[-60:])
                if m:
                    name = m.group(1)
                    if name in SAFE_ASSIGNS:
                        edits.append((lineno, col, col + len(text) + 2, f"t({jdump(text)})"))
                        continue
                    flags.append(dict(file=rel, line=lineno, type=f"assign_unsafe:{name}", text=text[:80]))
                    continue
                flags.append(dict(file=rel, line=lineno, type="literal", text=text[:80]))
                continue

            # kind == template
            if "${" in text:
                key, exprs = template_to_key(text)
                ctx_ok = PRE_TOAST.search(before[-40:]) or PRE_ERROR.search(before[-30:])
                m = PRE_ATTR.search(before[-60:])
                if m and is_tsx and m.group(1) in SAFE_ATTRS:
                    ctx_ok = True
                m2 = PRE_PROP.search(before[-60:])
                if m2 and m2.group(1) in PROP_VALUE_OK:
                    ctx_ok = True
                # component renderers (chart ticks, cell texts) — safe when the
                # line is not building an API payload / comparison
                if not ctx_ok and is_component_file(rel) and not any(mk in line for mk in PAYLOAD_MARKERS):
                    ctx_ok = True
                if ctx_ok:
                    params = ", ".join(f"p{i}: {e}" for i, e in enumerate(exprs))
                    call = f"t({jdump(key)}, {{ {params} }})" if exprs else f"t({jdump(key)})"
                    edits.append((lineno, col, col + len(text) + 2, call))
                else:
                    flags.append(dict(file=rel, line=lineno, type="template_param", text=text[:120]))
            else:
                flags.append(dict(file=rel, line=lineno, type="template", text=text[:80]))
            continue

        # ── JSX text nodes (tsx only) ──
        if is_tsx and False:
            pass
        if is_tsx:
            masked = mask_line(line)
            for m in re.finditer(r">([^<>{}\n]*[\u0600-\u06FF][^<>{}\n]*)<", masked):
                raw = m.group(1)
                txt = raw.strip()
                if not txt or not has_persian(txt):
                    continue
                if ENTITIES.search(txt) or "\n" in txt:
                    flags.append(dict(file=rel, line=lineno, type="jsx_entity", text=txt[:80]))
                    continue
                # skip when this span overlaps a string edit on the same line
                s, e = m.start(1) + (len(raw) - len(raw.lstrip())), m.end(1) - (len(raw) - len(raw.rstrip()))
                if any(l == lineno and not (e <= a or s >= b) for (l, a, b, _) in edits):
                    continue
                edits.append((lineno, s, e, f"{{t({jdump(txt)})}}"))
        # ── multi-line JSX text (pure text lines) ──
        if is_tsx:
            raw_stripped = line.strip()
            masked_stripped = mask_line(line).strip()
            if (
                masked_stripped
                and has_persian(masked_stripped)
                and not raw_stripped.startswith("*")
                and not raw_stripped.startswith("//")
                and not raw_stripped.startswith("/*")
                and not raw_stripped.endswith("*/")
                and not raw_stripped.endswith("*/}")
                # pure text only — any syntax char means it is not a bare text node
                and not re.search(r"[<>{}()\[\]:=,\"'`*]", masked_stripped)
                and "&" not in masked_stripped
            ):
                indent = line[: len(line) - len(line.lstrip())]
                txt = masked_stripped
                edits.append((lineno, 0, len(line), f'{indent}{{t({jdump(txt)})}}'))

            # text at END of line after a closing tag bracket:  <Icon/> متن
            for m in re.finditer(r"(?:/?>)\s*([^<>{}\n]*[\u0600-\u06FF][^<>{}\n]*?)\s*$", mask_line(line)):
                txt = m.group(1).strip()
                if not txt or not has_persian(txt):
                    continue
                if ENTITIES.search(txt):
                    continue
                s = m.start(1)
                e = m.end(1)
                if any(l == lineno and not (e <= a or s >= b) for (l, a, b, _) in edits):
                    continue
                # ignore if line ends with a tag closer (text already consumed above)
                edits.append((lineno, s, e, f"{{t({jdump(txt)})}}"))

    if not edits:
        return changed, flags, 0

    # apply edits right-to-left per line
    by_line = {}
    for (lineno, start, end, repl) in edits:
        by_line.setdefault(lineno, []).append((start, end, repl))
    for lineno, items in by_line.items():
        items.sort(key=lambda x: -x[0])
        line = lines[lineno - 1]
        for (start, end, repl) in items:
            line = line[:start] + repl + line[end:]
        lines[lineno - 1] = line
        changed = True

    n_edits = len(edits)
    if apply and changed:
        # import injection
        content = "\n".join(lines)
        if 'from "@/lib/i18n"' not in content:
            # find last top import line
            import_idx = -1
            for i, l in enumerate(lines[:80]):
                if l.startswith("import ") or (l.startswith("} from ") if False else False):
                    import_idx = i
                elif l.startswith("}") and i > 0 and "from" in l:
                    import_idx = i
            if import_idx >= 0:
                lines.insert(import_idx + 1, 'import { t } from "@/lib/i18n";')
            else:
                # after "use client" if present
                for i, l in enumerate(lines[:5]):
                    if l.strip() == '"use client";':
                        lines.insert(i + 1, "")
                        lines.insert(i + 2, 'import { t } from "@/lib/i18n";')
                        break
                else:
                    lines.insert(0, 'import { t } from "@/lib/i18n";')
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
    return changed, flags, n_edits

def edits_for(edits, lineno):
    return any(e[0] == lineno for e in edits)

def main():
    apply_mode = "--apply" in sys.argv
    report_files = []
    all_flags = []
    total_edits = 0
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames[:] = [d for d in dirnames if d not in {"node_modules", ".next", "i18n"} and not d.startswith(".")]
        for fn in sorted(filenames):
            if not (fn.endswith(".ts") or fn.endswith(".tsx")) or fn.endswith(".d.ts"):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, SRC)
            if is_server_file(rel):
                continue
            if rel in {"app/layout.tsx"}:  # server component — handled manually
                continue
            changed, flags, n = process_file(full, rel, apply_mode)
            all_flags.extend(flags)
            if n:
                report_files.append(dict(file=rel, edits=n))
                total_edits += n

    report = dict(mode="apply" if apply_mode else "dry", files=report_files,
                  total_edits=total_edits, flagged=all_flags)
    with open(os.path.join(ROOT, "scripts", "i18n", "replace-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    from collections import Counter
    print(f"mode={'APPLY' if apply_mode else 'DRY'} files_touched={len(report_files)} total_edits={total_edits}")
    print("flagged:", Counter(f["type"].split(":")[0] for f in all_flags).most_common())

if __name__ == "__main__":
    main()
