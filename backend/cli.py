"""Command line driver for the SOO parser.

  python backend/cli.py parse   <docx> [-o out.json]
  python backend/cli.py stats   <docx-or-dir>
  python backend/cli.py graph   <docx> --part 15
  python backend/cli.py map     <docx>
  python backend/cli.py findings <docx-or-dir>
"""
from __future__ import annotations

import argparse
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from soo import parse                      # noqa: E402
from soo import mermaid                    # noqa: E402
from soo.model import UNKNOWN, INVENTORY   # noqa: E402


def _targets(path: str) -> list[str]:
    if os.path.isdir(path):
        return sorted(glob.glob(os.path.join(path, "*.docx")))
    return [path]


def cmd_parse(args) -> None:
    doc = parse(args.path)
    out = doc.to_json()
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(out)
        print(f"{doc.source_file}: {len(doc.parts)} parts, {len(doc.groups)} groups, "
              f"{len(doc.steps)} steps -> {args.output}")
    else:
        print(out)


def cmd_stats(args) -> None:
    rows = []
    for path in _targets(args.path):
        doc = parse(path)
        classified = [g for g in doc.groups if g.operator != UNKNOWN]
        grouped_steps = sum(len(g.items) for g in doc.groups)
        coverage = 100 * grouped_steps / len(doc.steps) if doc.steps else 0
        op_cov = 100 * len(classified) / len(doc.groups) if doc.groups else 0
        errors = sum(1 for f in doc.findings if f.severity == "error")
        rows.append((doc.equipment_class[:38], len(doc.parts), len(doc.groups),
                     len(doc.steps), len(doc.setpoints), coverage, op_cov, errors))

    hdr = f"{'document':38} {'parts':>5} {'grps':>5} {'steps':>6} {'sp':>4} {'in-grp':>7} {'op-cls':>7} {'err':>4}"
    print(hdr)
    print("-" * len(hdr))
    for r in rows:
        print(f"{r[0]:38} {r[1]:5} {r[2]:5} {r[3]:6} {r[4]:4} {r[5]:6.1f}% {r[6]:6.1f}% {r[7]:4}")

    if len(rows) > 1:
        n = len(rows)
        print("-" * len(hdr))
        print(f"{'TOTAL / mean':38} {sum(r[1] for r in rows):5} {sum(r[2] for r in rows):5} "
              f"{sum(r[3] for r in rows):6} {sum(r[4] for r in rows):4} "
              f"{sum(r[5] for r in rows)/n:6.1f}% {sum(r[6] for r in rows)/n:6.1f}% "
              f"{sum(r[7] for r in rows):4}")


def cmd_findings(args) -> None:
    order = {"error": 0, "warning": 1, "info": 2}
    for path in _targets(args.path):
        doc = parse(path)
        print(f"\n=== {doc.source_file}  [{doc.doc_type}]")
        if not doc.findings:
            print("    clean")
            continue
        for f in sorted(doc.findings, key=lambda f: (order[f.severity], f.rule)):
            if args.severity and f.severity != args.severity:
                continue
            loc = f"PART {f.part}" if f.part else "-"
            print(f"    [{f.severity:7}] {f.rule:22} {loc:8} {f.message}")


def cmd_graph(args) -> None:
    doc = parse(args.path)
    print(mermaid.render_part(doc, args.part, include_inventory=args.inventory))


def cmd_map(args) -> None:
    print(mermaid.render_map(parse(args.path)))


def main() -> None:
    ap = argparse.ArgumentParser(prog="soo")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("parse"); p.add_argument("path"); p.add_argument("-o", "--output")
    p.set_defaults(func=cmd_parse)

    p = sub.add_parser("stats"); p.add_argument("path"); p.set_defaults(func=cmd_stats)

    p = sub.add_parser("findings"); p.add_argument("path")
    p.add_argument("--severity", choices=["error", "warning", "info"])
    p.set_defaults(func=cmd_findings)

    p = sub.add_parser("graph"); p.add_argument("path")
    p.add_argument("--part", type=int, required=True)
    p.add_argument("--inventory", action="store_true")
    p.set_defaults(func=cmd_graph)

    p = sub.add_parser("map"); p.add_argument("path"); p.set_defaults(func=cmd_map)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
