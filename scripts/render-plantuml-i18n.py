#!/usr/bin/env python3
"""Render the documentation's PlantUML diagrams in German, French, Dutch and
Spanish (ADR-071), next to the English SVG that scripts/render-plantuml.sh
writes: docs/<area>/diagrams/<name>.puml becomes docs/<area>/img/<name>.svg
(English, untouched here) and docs/<area>/img/<name>.<lang>.svg.

The labels of a diagram are in docs/<area>/diagrams/<name>.labels.json, one
dictionary per language with the English text as the key, as the interface
dictionaries do (ADR-070):

    {"de": {"Health data user\\nconsumer connector": "Gesundheitsdatennutzer\\nVerbraucher-Connector", ...},
     "fr": {...}, "nl": {...}, "es": {...}}

Only the texts a reader sees are looked up: titles, quoted names, message and
relation labels, notes, activity steps, swimlanes and conditions. Aliases,
skinparams, entity fields and comments are never touched, so the layout and
the arrows stay those of the English diagram. A text with no entry stays
English (the fallback); --missing lists them.

    python3 scripts/render-plantuml-i18n.py                       # every language, every diagram with labels
    python3 scripts/render-plantuml-i18n.py --lang de docs/security/diagrams/ehds-operating-model.puml
    python3 scripts/render-plantuml-i18n.py --extract FILE.puml   # the English texts, one per line
    python3 scripts/render-plantuml-i18n.py --missing             # texts without a translation

Then python3 scripts/gen-docs-content.py copies the variants a page uses and
python3 scripts/gen-localized-images.py lists them. Needs plantuml and
graphviz (brew install plantuml).
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ["de", "fr", "nl", "es"]

SKIP = re.compile(r"^\s*('|skinparam\b|!|@start|@end|hide\b|show\b|set\b|left to right|top to bottom|"
                  r"autonumber|scale\b|\}|\{|$|start$|stop$|end$|endif|fork|end fork|detach|kill)")
ARROW = re.compile(r"(<?[-.=]+(\[[^\]]*\])?[-.=]*>{1,2}[xo]?|<{1,2}[-.=]+|[-.]{2,}|\|>|<\|)")
BODY_START = re.compile(r"^\s*(class|entity|interface|enum|abstract|object|map|json|struct)\b.*\{\s*$")
GROUP_WORD = re.compile(r"^(\s*(?:group|alt|else|opt|loop|par|break|critical|partition|box)\s+)(.+?)(\s*\{?\s*)$")
PARENS_START = re.compile(r"^\s*(if|elseif|else|while|endwhile|repeat while|backward|case|switch)\b")


def quoted_spans(line, start=0, end=None):
    end = len(line) if end is None else end
    return [(start + m.start(1), start + m.end(1))
            for m in re.finditer(r'"([^"]*)"', line[start:end]) if m.group(1).strip()]


def paren_spans(line):
    """The inner text of each top-level (...) group, nested parentheses kept."""
    spans, depth, open_at = [], 0, None
    for i, ch in enumerate(line):
        if ch == "(":
            if depth == 0:
                open_at = i + 1
            depth += 1
        elif ch == ")" and depth:
            depth -= 1
            if depth == 0 and line[open_at:i].strip():
                spans.append((open_at, i))
    return spans


def trimmed(line, a, b):
    """(a, b) without surrounding blanks; None when nothing is left."""
    while a < b and line[a].isspace():
        a += 1
    while b > a and line[b - 1].isspace():
        b -= 1
    return (a, b) if a < b else None


def spans_of(lines):
    """Per line, the (start, end) of each text a reader sees."""
    out = [[] for _ in lines]
    state, body_depth = None, 0
    for n, line in enumerate(lines):
        s = line.strip()
        if state == "body":
            body_depth += line.count("{") - line.count("}")
            if body_depth <= 0:
                state = None
            continue
        if state in ("note", "legend", "title"):
            if re.match(r"^\s*(end\s*note|endlegend|end\s*legend|end\s*title|endhnote|endrnote|end\s*hnote|end\s*rnote)\b", line):
                state = None
                continue
            sp = trimmed(line, 0, len(line))
            if sp:
                out[n].append(sp)
            continue
        if state == "activity":
            body = line.rstrip()
            if body.endswith(";"):
                state = None
                body = body[:-1]
            sp = trimmed(line, 0, len(body))
            if sp:
                out[n].append(sp)
            continue
        if SKIP.match(line) and not s.startswith("}"):
            continue
        if BODY_START.match(line):
            state, body_depth = "body", 1
            # A quoted name on the declaration line is still a label.
            out[n].extend(quoted_spans(line))
            continue
        m = re.match(r"^(\s*title\s+)(.+?)\s*$", line)
        if m:
            out[n].append((m.end(1), m.end(2)))
            continue
        if re.match(r"^\s*title\s*$", line):
            state = "title"
            continue
        if re.match(r"^\s*legend\b", line):
            state = "legend"
            continue
        m = re.match(r"^\s*[hr]?note\b", line)
        if m:
            colon = line.find(":")
            if colon >= 0:
                sp = trimmed(line, colon + 1, len(line))
                if sp:
                    out[n].append(sp)
            else:
                state = "note"
            continue
        if s.startswith(":"):
            a = line.index(":") + 1
            body = line.rstrip()
            if body.endswith(";"):
                sp = trimmed(line, a, len(body) - 1)
            else:
                state = "activity"
                sp = trimmed(line, a, len(body))
            if sp:
                out[n].append(sp)
            continue
        if s.startswith("|"):
            m = re.match(r"^(\s*\|(?:#[0-9A-Za-z]+\|)?)([^|]+)\|", line)
            if m:
                out[n].append((m.start(2), m.end(2)))
            continue
        if PARENS_START.match(line):
            out[n].extend(paren_spans(line))
            continue
        m = re.match(r"^(\s*(==+)\s*)(.+?)(\s*\2\s*)$", line)
        if m:
            out[n].append((m.start(3), m.end(3)))
            continue
        m = re.match(r"^(\s*\.\.\.\s*)(.+?)(\s*\.\.\.\s*)$", line)
        if m:
            out[n].append((m.start(2), m.end(2)))
            continue
        m = re.match(r"^\s*ref over [^:]+:", line)
        if m:
            sp = trimmed(line, m.end(), len(line))
            if sp:
                out[n].append(sp)
            continue
        m = GROUP_WORD.match(line)
        if m:
            text = m.group(2)
            if text.startswith('"'):
                out[n].extend(quoted_spans(line))
            elif not re.match(r"^[\w.]+$", text) or m.group(1).strip() in ("group", "alt", "else", "opt", "loop", "par", "break", "critical"):
                out[n].append((m.start(2), m.end(2)))
            continue
        arrow = ARROW.search(line)
        colon = line.find(" : ") if arrow else -1
        if colon < 0 and arrow:
            colon = line.find(":", arrow.end())
            colon = colon - 1 if colon > 0 else -1
        if arrow and colon >= 0:
            out[n].extend(quoted_spans(line, 0, colon))
            sp = trimmed(line, line.index(":", colon) + 1, len(line))
            if sp:
                out[n].append(sp)
            continue
        out[n].extend(quoted_spans(line))
        # [Component name] and (use case) labels in deployment views.
        for b in re.finditer(r"\[([^\]\n]+)\]", line):
            if not re.match(r"^#|^\w+$", b.group(1)):
                out[n].append((b.start(1), b.end(1)))
    return out


def texts(src):
    lines = src.split("\n")
    seen, result = set(), []
    for line, spans in zip(lines, spans_of(lines)):
        for a, b in spans:
            t = line[a:b]
            if t not in seen and re.search(r"[A-Za-z]{2}", t):
                seen.add(t)
                result.append(t)
    return result


def localize(src, labels):
    lines = src.split("\n")
    for n, spans in enumerate(spans_of(lines)):
        line = lines[n]
        for a, b in sorted(spans, reverse=True):
            t = line[a:b]
            if t in labels:
                line = line[:a] + labels[t] + line[b:]
        lines[n] = line
    return "\n".join(lines)


def labels_path(puml):
    return puml[: -len(".puml")] + ".labels.json"


def sources(args):
    if args.files:
        return [os.path.abspath(f) for f in args.files]
    found = sorted(glob.glob(os.path.join(ROOT, "docs", "*", "diagrams", "*.puml")))
    return [f for f in found if os.path.isfile(labels_path(f))]


def render(puml, lang, text):
    out_dir = os.path.join(os.path.dirname(os.path.dirname(puml)), "img")
    name = os.path.basename(puml)[: -len(".puml")]
    target = os.path.join(out_dir, f"{name}.{lang}.svg")
    proc = subprocess.run(["plantuml", "-tsvg", "-pipe", "-charset", "UTF-8"], input=text.encode("utf-8"),
                          cwd=os.path.dirname(puml), capture_output=True)
    if proc.returncode != 0 or not proc.stdout.lstrip().startswith(b"<"):
        sys.stderr.write(proc.stderr.decode("utf-8", "replace"))
        raise SystemExit(f"render-plantuml-i18n: plantuml failed on {os.path.relpath(puml, ROOT)} ({lang})")
    svg = proc.stdout
    # As render-plantuml.sh: a final newline, so the end-of-file hook leaves it alone.
    if not svg.endswith(b"\n"):
        svg += b"\n"
    os.makedirs(out_dir, exist_ok=True)
    with open(target, "wb") as f:
        f.write(svg)
    print(f"{os.path.relpath(puml, ROOT)} -> {os.path.relpath(target, ROOT)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lang", choices=LANGS + ["all"], default="all")
    ap.add_argument("--extract", action="store_true", help="print the English texts of each file")
    ap.add_argument("--missing", action="store_true", help="list texts that have no translation")
    ap.add_argument("files", nargs="*")
    args = ap.parse_args()
    langs = LANGS if args.lang == "all" else [args.lang]
    status = 0
    for puml in sources(args):
        with open(puml, encoding="utf-8") as f:
            src = f.read()
        if args.extract:
            for t in texts(src):
                print(json.dumps(t, ensure_ascii=False))
            continue
        try:
            with open(labels_path(puml), encoding="utf-8") as f:
                all_labels = json.load(f)
        except OSError:
            all_labels = {}
        for lang in langs:
            labels = all_labels.get(lang, {})
            if args.missing:
                for t in texts(src):
                    if t not in labels:
                        print(f"{os.path.relpath(puml, ROOT)} [{lang}] {json.dumps(t, ensure_ascii=False)}")
                        status = 1
                continue
            render(puml, lang, localize(src, labels))
    return status


if __name__ == "__main__":
    sys.exit(main())
