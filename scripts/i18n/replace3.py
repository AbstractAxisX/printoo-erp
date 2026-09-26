#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PHASE 27 — pass 3: JSX mixed text+expression → t("… {p0} …", { p0: expr }).

Handles client .tsx lines like:
    <h3>دسته‌ها ({categories.length})</h3>
    مجموع: {filteredCosts.length} از {allCosts.length} هزینه
    مشاهده همه <Icon name="arrowLeft" />
    {o.items?.length ?? 0} آیتم • {formatDate(o.createdAt)}

Regions (on the string-masked line; positions map 1:1 to the original):
  A: >text-and-{exprs}<          (inline JSX text node)
  B: ^text-and-{exprs}<          (text node ending at a tag on same line)
  C: >text-and-{exprs}$          (text node running to end of line)
  D: whole-line text-and-{exprs} (bare text node, no brackets at all)

Only fires when the built KEY contains Persian. Skips comment-ish lines
(`*`, `//`, `/*`, `*/`) and lines containing `/*` or `*/`.

Usage: python3 scripts/i18n/replace3.py [--apply]
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import mask_line, has_persian, is_server_file  # noqa: E402

ROOT = "/home/z/my-project"
SRC = os.path.join(ROOT, "src")

def jdump(s):
    return json.dumps(s, ensure_ascii=False)

def trim_region(line, start, end):
    """Trim stray expression-boundary chars (} ) leading, { ( trailing) —
    they belong to multi-line expressions, not to the text node."""
    while start < end and line[start] in "}) \t":
        start += 1
    while end > start and line[end - 1] in "{( \t":
        end -= 1
    return start, end

def parse_region(region_text):
    """Split a region into alternating [text, expr, text, ...].
    Returns (parts, exprs) where parts uses {pN} placeholders, or None if
    the region cannot be parsed safely (unbalanced braces)."""
    parts = []
    exprs = []
    buf = ""
    i = 0
    n = len(region_text)
    while i < n:
        c = region_text[i]
        if c == "{":
            depth = 1
            j = i + 1
            while j < n and depth > 0:
                if region_text[j] == "{":
                    depth += 1
                elif region_text[j] == "}":
                    depth -= 1
                j += 1
            if depth != 0:
                return None
            expr = region_text[i + 1 : j - 1].strip()
            if not expr:
                return None
            parts.append(buf)
            buf = ""
            exprs.append(expr)
            parts.append("{p%d}" % (len(exprs) - 1))
            i = j
            continue
        buf += c
        i += 1
    parts.append(buf)
    return "".join(parts), exprs

def wrap_region(key, exprs):
    if exprs:
        params = ", ".join(f"p{i}: {e}" for i, e in enumerate(exprs))
        return f'{{t({jdump(key)}, {{ {params} }})}}'
    return f"{{t({jdump(key)})}}"

def process_line(line):
    """Return (start, end, replacement) for one line or None."""
    if "/*" in line or "*/" in line:
        return None
    stripped = line.strip()
    if stripped.startswith("*") or stripped.startswith("//"):
        return None
    masked = mask_line(line)
    if not has_persian(masked):
        return None

    indent = line[: len(line) - len(line.lstrip())]

    # ── region A: > … < ── (tag bracket only — NOT the > of => arrows)
    mA = re.search(r"(?<=[A-Za-z0-9\"'\)/\s}])>(?=[^<>\n]*[\u0600-\u06FF])([^<>\n]*)<", masked)
    if mA:
        region = mA.group(1)
        parsed = parse_region(region)
        if parsed:
            key, exprs = parsed
            key = key.strip()
            if has_persian(key):
                s = mA.start(1) + (len(region) - len(region.lstrip()))
                e = mA.end(1) - (len(region) - len(region.rstrip()))
                s, e = trim_region(line, s, e)
                if s >= e:
                    return None
                # expressions must come from the ORIGINAL line
                exprs_orig = []
                for ex in exprs:
                    exprs_orig.append(ex)
                # re-parse against original region for real expr text
                orig_region = line[s:e]
                parsed_orig = parse_region(orig_region)
                if parsed_orig:
                    _, exprs_orig = parsed_orig
                    return s, e, wrap_region(key, exprs_orig)
        return None

    # ── region B: ^text…< (text node ending at a tag) ──
    mB = re.match(r"(\s*)([^<>\n]*[\u0600-\u06FF][^<>\n]*?)(?=<)", masked)
    if mB and has_persian(mB.group(2)):
        region = mB.group(2)
        parsed = parse_region(region)
        if parsed:
            key, exprs = parsed
            key = key.rstrip()
            if has_persian(key.strip()):
                orig_region = line[mB.start(2):mB.end(2)]
                parsed_orig = parse_region(orig_region)
                exprs_orig = parsed_orig[1] if parsed_orig else exprs
                s = mB.start(2)
                e = mB.end(2)
                return s, e, wrap_region(key, exprs_orig)
        return None

    # ── region C: >text…$ (after a closing tag bracket to EOL) ──
    mC = re.search(r"(?<=[A-Za-z0-9\"'\)/\s}])>([^<>\n]*[\u0600-\u06FF][^<>\n]*)$", masked)
    if mC:
        region = mC.group(1)
        parsed = parse_region(region)
        if parsed:
            key, exprs = parsed
            key = key.strip()
            if has_persian(key):
                s = mC.start(1) + (len(region) - len(region.lstrip()))
                e = mC.end(1) - (len(region) - len(region.rstrip()))
                s, e = trim_region(line, s, e)
                if s >= e:
                    return None
                orig_region = line[s:e]
                parsed_orig = parse_region(orig_region)
                exprs_orig = parsed_orig[1] if parsed_orig else exprs
                return s, e, wrap_region(key, exprs_orig)
        return None

    # ── region D: whole-line bare text node ──
    if not re.search(r"[<>=]", masked):
        first = len(line) - len(line.lstrip())
        last = len(line.rstrip())
        first, last = trim_region(line, first, last)
        if first < last:
            region = line[first:last]
            parsed = parse_region(region)
            if parsed:
                key, exprs = parsed
                key = key.strip()
                if has_persian(key):
                    parsed_orig = parse_region(region)
                    exprs_orig = parsed_orig[1] if parsed_orig else exprs
                    return first, last, wrap_region(key, exprs_orig)
    return None

def process_file(path, rel, apply_mode):
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    edits = []
    for lineno, line in enumerate(lines, 1):
        r = process_line(line)
        if r:
            edits.append((lineno, r[0], r[1], r[2]))
    if not edits:
        return 0
    by_line = {}
    for (lineno, start, end, repl) in edits:
        by_line.setdefault(lineno, []).append((start, end, repl))
    for lineno, items in by_line.items():
        items.sort(key=lambda x: -x[0])
        line = lines[lineno - 1]
        for (start, end, repl) in items:
            line = line[:start] + repl + line[end:]
        lines[lineno - 1] = line
    if apply_mode:
        content = "\n".join(lines)
        if 'from "@/lib/i18n"' not in content:
            import_idx = -1
            for i, l in enumerate(lines[:80]):
                if l.startswith("import "):
                    import_idx = i
            if import_idx >= 0:
                lines.insert(import_idx + 1, 'import { t } from "@/lib/i18n";')
            else:
                found = False
                for i, l in enumerate(lines[:5]):
                    if l.strip() == '"use client";':
                        lines.insert(i + 1, "")
                        lines.insert(i + 2, 'import { t } from "@/lib/i18n";')
                        found = True
                        break
                if not found:
                    lines.insert(0, 'import { t } from "@/lib/i18n";')
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
    return len(edits)

def main():
    apply_mode = "--apply" in sys.argv
    total = 0
    touched = []
    flagged = []
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames[:] = [d for d in dirnames if d not in {"node_modules", ".next", "i18n"} and not d.startswith(".")]
        for fn in sorted(filenames):
            if not fn.endswith(".tsx"):
                continue
            rel = os.path.relpath(os.path.join(dirpath, fn), SRC)
            if is_server_file(rel) or rel == "app/layout.tsx":
                continue
            n = process_file(os.path.join(dirpath, fn), rel, apply_mode)
            if n:
                touched.append((rel, n))
                total += n
    print(f"mode={'APPLY' if apply_mode else 'DRY'} files={len(touched)} edits={total}")
    for f, n in sorted(touched)[:40]:
        print(f"  {f}: {n}")

if __name__ == "__main__":
    main()
