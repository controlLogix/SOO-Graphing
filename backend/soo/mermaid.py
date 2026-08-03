"""IR -> Mermaid flowchart, one PART at a time.

A whole document is 20-53 parts and is unreadable as a single flow, so a part is
the right unit. This exists to eyeball the parse before committing to a real
canvas; React Flow renders from the same IR later.
"""
from __future__ import annotations

from .model import AND, OR, SEQUENCE, INVENTORY, Document

_GATE = {AND: "ALL of", OR: "ANY of"}
MAX_LABEL = 70


def _label(text: str, limit: int = MAX_LABEL) -> str:
    text = " ".join(text.split()).rstrip(":")
    if len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"
    return text.replace('"', "'").replace("#", "＃")


def render_part(doc: Document, n: int, include_inventory: bool = False) -> str:
    part = doc.part(n)
    if part is None:
        raise ValueError(f"{doc.source_file} has no PART {n}")

    lines = [f"---", f"title: PART {part.n} — {part.title}", "---", "flowchart TD"]

    if part.is_inventory and not include_inventory:
        lines.append(f'  INV["{_label(part.title)}<br/>(inventory — {_item_count(doc, part)} items)"]')
        return "\n".join(lines)

    for sid in part.statements:
        step = doc.step(sid)
        if step:
            lines.append(f'  {sid}["{_label(step.text)}"]')

    for gid in part.groups:
        group = doc.group(gid)
        if group is None:
            continue
        if group.operator == INVENTORY:
            lines.append(f'  {gid}["{_label(group.lead_in)}<br/>({len(group.items)} items)"]')
        elif group.operator == SEQUENCE:
            lines.append(f'  {gid}(["{_label(group.lead_in)}"])')
            prev = gid
            for sid in group.items:
                step = doc.step(sid)
                if not step:
                    continue
                lines.append(f'  {prev} --> {sid}["{_label(step.text)}"]')
                prev = sid
        else:
            gate = _GATE.get(group.operator, "?")
            for sid in group.items:
                step = doc.step(sid)
                if not step:
                    continue
                lines.append(f'  {sid}["{_label(step.text)}"] --> {gid}_gate')
            lines.append(f'  {gid}_gate{{"{gate}"}}')
            tail = f"{gid}_gate"
            if group.delay:
                lines.append(f'  {tail} --> {gid}_delay[/"wait {_label(group.delay, 40)}"/]')
                tail = f"{gid}_delay"
            lines.append(f'  {tail} --> {gid}(["{_label(group.lead_in)}"])')

    _style(lines, doc, part)
    return "\n".join(lines)


def _item_count(doc: Document, part) -> int:
    return sum(len(g.items) for g in doc.groups if g.part == part.n)


def _style(lines: list[str], doc: Document, part) -> None:
    """Optional equipment renders ghosted so the gap report does not flag it."""
    optional = [
        s.id
        for s in doc.steps
        if s.part == part.n and s.condition
    ]
    if optional:
        lines.append("  classDef optional stroke-dasharray: 4 3,opacity:0.65")
        lines.append(f"  class {','.join(optional)} optional")


def render_map(doc: Document) -> str:
    """Document-level map: parts in order, inventories marked."""
    lines = ["---", f"title: {doc.equipment_class} — part map", "---", "flowchart LR"]
    prev = None
    for p in doc.parts:
        shape = f'P{p.n}["PART {p.n}<br/>{_label(p.title, 40)}"]'
        lines.append(f"  {shape}" if prev is None else f"  P{prev} --> {shape}")
        prev = p.n
    inventories = [f"P{p.n}" for p in doc.parts if p.is_inventory]
    if inventories:
        lines.append("  classDef inv fill:#eee,stroke:#999,color:#555")
        lines.append(f"  class {','.join(inventories)} inv")
    return "\n".join(lines)
