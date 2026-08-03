"""Read a .docx into a flat block stream, preserving list identity.

Uses only the stdlib. Word's numbering (`numId`) is what binds list items to the
lead-in sentence above them, so it has to survive into the block stream — that
association is the backbone of the whole parse.
"""
from __future__ import annotations

import re
import zipfile
from dataclasses import dataclass, field
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# Not every author uses Word's list numbering. `016. TES Tanks` types the bullet
# glyph directly into an ordinary paragraph, which leaves no numId to group on, so
# those get a synthetic one. Contiguity does the rest of the work.
BULLET_RE = re.compile(r"^\s*[•▪●○◦‣⁃]\s+")
SYNTHETIC_NUM_ID = "bullet"


@dataclass
class Block:
    index: int
    kind: str  # "para" | "table"
    text: str = ""
    style: str = ""
    num_id: str | None = None
    level: int = 0
    rows: list[list[str]] = field(default_factory=list)

    @property
    def is_list_item(self) -> bool:
        return self.num_id is not None


def _text(el) -> str:
    return "".join(t.text or "" for t in el.iter(W + "t"))


def _style(p) -> str:
    pr = p.find(W + "pPr")
    if pr is None:
        return ""
    s = pr.find(W + "pStyle")
    return s.get(W + "val", "") if s is not None else ""


def _numbering(p) -> tuple[str | None, int]:
    pr = p.find(W + "pPr")
    if pr is None:
        return None, 0
    num = pr.find(W + "numPr")
    if num is None:
        return None, 0
    num_id = num.find(W + "numId")
    ilvl = num.find(W + "ilvl")
    return (
        num_id.get(W + "val") if num_id is not None else None,
        int(ilvl.get(W + "val")) if ilvl is not None else 0,
    )


def _table_rows(tbl) -> list[list[str]]:
    rows = []
    for tr in tbl.findall(W + "tr"):
        rows.append([_text(tc).strip() for tc in tr.findall(W + "tc")])
    return rows


def read_blocks(path: str) -> list[Block]:
    """Flatten a .docx body into ordered Blocks. Empty paragraphs are dropped."""
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))

    body = root.find(W + "body")
    if body is None:
        return []

    blocks: list[Block] = []
    for el in body:
        tag = el.tag.replace(W, "")
        if tag == "p":
            text = " ".join(_text(el).split())
            if not text:
                continue
            num_id, level = _numbering(el)
            if num_id is None and BULLET_RE.match(text):
                text = BULLET_RE.sub("", text)
                num_id = SYNTHETIC_NUM_ID
            blocks.append(
                Block(
                    index=len(blocks),
                    kind="para",
                    text=text,
                    style=_style(el),
                    num_id=num_id,
                    level=level,
                )
            )
        elif tag == "tbl":
            rows = _table_rows(el)
            if rows:
                blocks.append(Block(index=len(blocks), kind="table", rows=rows))

    return blocks
