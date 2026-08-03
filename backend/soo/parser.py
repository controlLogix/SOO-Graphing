"""Doc -> IR.

Three passes, deliberately boring:
  1. structure  — split on `PART n –` text, not Word styles (there are none)
  2. grouping   — bind each numbered list to its lead-in via Word's numId
  3. extraction — items become steps, carrying modality and conditionality through
"""
from __future__ import annotations

import os
import re
import zipfile

from . import lead_in as li
from . import spine
from .docx_reader import Block, read_blocks
from .model import (
    Document, Finding, Group, Part, Setpoint, Source, Step, INVENTORY, UNKNOWN,
)

PART_RE = re.compile(r"^PART\s*(\d+)\s*[-–—]\s*(.*)$", re.I)
END_RE = re.compile(r"^END OF SECTION\s*$", re.I)

_NUM = re.compile(r"-?\d+(?:\.\d+)?")
_PLACEHOLDER = re.compile(r"\[?_{2,}")
_UNITS = re.compile(r"(°?[FC]\b|degF|degC|psi|in\.?\s*w\.?c\.?|gpm|cfm|%|Pa|kPa|s\b|min\b)", re.I)


def equipment_class(path: str) -> str:
    stem = os.path.splitext(os.path.basename(path))[0]
    stem = re.sub(r"^\d+[a-z]?\.?\s*", "", stem)
    stem = re.sub(r"^SOO\s*", "", stem, flags=re.I)
    stem = re.sub(r"[-–]\s*(old|OLD|REV\s*\d+)$", "", stem, flags=re.I)
    return stem.strip()


def _split_parts(blocks: list[Block]) -> list[Part]:
    parts: list[Part] = []
    for b in blocks:
        if b.kind != "para":
            continue
        if END_RE.match(b.text):
            break
        m = PART_RE.match(b.text)
        if not m:
            continue
        title = " ".join(m.group(2).split())
        arch = spine.archetype(title)
        if parts:
            parts[-1].block_end = b.index - 1
        parts.append(
            Part(
                n=int(m.group(1)),
                title=title,
                archetype=arch,
                is_inventory=spine.is_inventory(arch),
                block_start=b.index,
            )
        )
    if parts:
        parts[-1].block_end = blocks[-1].index if blocks else parts[-1].block_start
    return parts


def _part_at(parts: list[Part], index: int) -> Part | None:
    for p in parts:
        if p.block_start <= index <= p.block_end:
            return p
    return None


def _parse_setpoints(blocks: list[Block], parts: list[Part]) -> list[Setpoint]:
    out: list[Setpoint] = []
    for b in blocks:
        if b.kind != "table" or not b.rows:
            continue
        header = [c.lower() for c in b.rows[0]]
        if not any("setpoint" in c for c in header):
            continue
        part = _part_at(parts, b.index)
        for row in b.rows[1:]:
            if len(row) < 2 or not row[0].strip():
                continue
            name, raw = row[0].strip(), row[1].strip()
            placeholder = bool(_PLACEHOLDER.search(raw)) or not raw
            num = _NUM.search(raw)
            units = _UNITS.search(raw)
            out.append(
                Setpoint(
                    id=re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:60],
                    name=name,
                    raw_value=raw,
                    value=float(num.group()) if num and not placeholder else None,
                    units=units.group().strip() if units else None,
                    is_placeholder=placeholder,
                    declared_in_part=part.n if part else None,
                )
            )
    return out


def _extract_groups(blocks: list[Block], parts: list[Part], doc: Document) -> None:
    gid = sid = 0
    i = 0
    while i < len(blocks):
        b = blocks[i]
        if b.kind != "para" or b.is_list_item or PART_RE.match(b.text):
            i += 1
            continue

        part = _part_at(parts, b.index)
        part_n = part.n if part else None

        # A lead-in owns the contiguous run of list items that follows it.
        run: list[Block] = []
        j = i + 1
        if j < len(blocks) and blocks[j].kind == "para" and blocks[j].is_list_item:
            num_id = blocks[j].num_id
            while (
                j < len(blocks)
                and blocks[j].kind == "para"
                and blocks[j].num_id == num_id
            ):
                run.append(blocks[j])
                j += 1

        if run and li.is_lead_in(b.text):
            gid += 1
            group = Group(
                id=f"G{gid}",
                part=part_n,
                lead_in=b.text,
                operator=li.classify(b.text),
                modality=li.modality(b.text),
                delay=li.delay(b.text),
                condition=li.condition(b.text),
                source=Source(part=part_n, block=b.index),
            )
            if part and part.is_inventory:
                group.operator = INVENTORY
            for item in run:
                sid += 1
                step = Step(
                    id=f"S{sid}",
                    text=item.text,
                    part=part_n,
                    group=group.id,
                    modality=li.modality(item.text) or group.modality,
                    condition=li.condition(item.text) or group.condition,
                    source=Source(part=part_n, block=item.index),
                )
                doc.steps.append(step)
                group.items.append(step.id)
            doc.groups.append(group)
            if part:
                part.groups.append(group.id)
            i = j
            continue

        if run and not li.is_lead_in(b.text):
            doc.findings.append(
                Finding(
                    rule="list_without_lead_in",
                    severity="warning",
                    message=f"Numbered list has no colon lead-in above it: {b.text[:70]!r}",
                    part=part_n,
                    block=b.index,
                )
            )

        # Standalone prose statement.
        sid += 1
        step = Step(
            id=f"S{sid}",
            text=b.text,
            part=part_n,
            group=None,
            modality=li.modality(b.text),
            condition=li.condition(b.text),
            source=Source(part=part_n, block=b.index),
        )
        doc.steps.append(step)
        if part:
            part.statements.append(step.id)
        i += 1


def _orphan_findings(blocks: list[Block], parts: list[Part], doc: Document) -> None:
    """A list item that lost its numbering reads as body prose and mis-parses.

    Detected conservatively: a non-numbered paragraph directly after a numbered run
    that has no terminal punctuation. Orphans that happen to end in a period (the
    corpus has some) are not caught by this rule.
    """
    for i in range(1, len(blocks)):
        prev, cur = blocks[i - 1], blocks[i]
        if cur.kind != "para" or cur.is_list_item or not prev.is_list_item:
            continue
        if PART_RE.match(cur.text) or li.is_lead_in(cur.text):
            continue
        if cur.text.rstrip().endswith((".", ":", ";")):
            continue
        part = _part_at(parts, cur.index)
        doc.findings.append(
            Finding(
                rule="orphaned_list_item",
                severity="warning",
                message=f"Reads as a list item but lost its numbering: {cur.text[:70]!r}",
                part=part.n if part else None,
                block=cur.index,
            )
        )


def _spine_findings(doc: Document) -> None:
    numbers = [p.n for p in doc.parts]
    for prev, nxt in zip(numbers, numbers[1:]):
        if nxt != prev + 1:
            missing = ", ".join(str(n) for n in range(prev + 1, nxt))
            doc.findings.append(
                Finding(
                    rule="part_numbering_gap",
                    severity="error",
                    message=f"PART numbering jumps {prev} -> {nxt}; missing PART {missing}",
                    part=prev,
                )
            )

    if doc.doc_type == "delta":
        return

    present = {p.archetype for p in doc.parts}
    for arch in spine.CANONICAL_ORDER:
        if arch in present:
            continue
        required = arch in spine.REQUIRED_ARCHETYPES
        doc.findings.append(
            Finding(
                rule="missing_spine_part",
                severity="error" if required else "info",
                message=f"No {arch.replace('_', ' ')} part in this document",
            )
        )

    for g in doc.groups:
        if g.operator == UNKNOWN:
            doc.findings.append(
                Finding(
                    rule="unclassified_lead_in",
                    severity="info",
                    message=f"Lead-in matched no operator pattern: {g.lead_in[:70]!r}",
                    part=g.part,
                    block=g.source.block if g.source else None,
                )
            )


def _setpoint_findings(doc: Document) -> None:
    placeholders = [s for s in doc.setpoints if s.is_placeholder]
    if placeholders:
        doc.findings.append(
            Finding(
                rule="setpoint_placeholder",
                severity="info",
                message=(
                    f"{len(placeholders)} of {len(doc.setpoints)} setpoints still hold "
                    f"template placeholders (normal for an unissued tender document)"
                ),
                part=placeholders[0].declared_in_part,
            )
        )
    if not doc.setpoints:
        doc.findings.append(
            Finding(
                rule="no_setpoint_table",
                severity="error",
                message="No Adjustable Setpoints table found",
            )
        )


def parse(path: str) -> Document:
    doc = Document(source_file=os.path.basename(path), equipment_class=equipment_class(path))

    if os.path.getsize(path) == 0:
        doc.findings.append(
            Finding(rule="empty_document", severity="error", message="File is zero bytes")
        )
        return doc

    try:
        blocks = read_blocks(path)
    except (zipfile.BadZipFile, KeyError) as exc:
        doc.findings.append(
            Finding(
                rule="unreadable_document",
                severity="error",
                message=f"Not a readable .docx ({exc.__class__.__name__})",
            )
        )
        return doc

    if not blocks:
        doc.findings.append(
            Finding(rule="empty_document", severity="error", message="Document has no content")
        )
        return doc

    doc.parts = _split_parts(blocks)
    if any(re.search(r"\brevised\b", p.title, re.I) for p in doc.parts):
        doc.doc_type = "delta"

    if not doc.parts:
        doc.findings.append(
            Finding(
                rule="no_parts",
                severity="error",
                message="No `PART n –` headings found; document structure unrecognised",
            )
        )
        return doc

    doc.setpoints = _parse_setpoints(blocks, doc.parts)
    _extract_groups(blocks, doc.parts, doc)
    _orphan_findings(blocks, doc.parts, doc)
    _spine_findings(doc)
    _setpoint_findings(doc)
    return doc
