"""The SOO intermediate representation.

Both directions of the tool talk to this. Documents parse into it, graphs render
from it, prose generates from it, and the gap rules run on it.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict

# Logical operator a lead-in sentence imposes on the list beneath it.
AND = "AND"
OR = "OR"
SEQUENCE = "SEQUENCE"
INVENTORY = "INVENTORY"
UNKNOWN = "UNKNOWN"

# Contractual force. Never silently promoted or demoted during generation.
SHALL = "shall"
SHALL_NOT = "shall not"
SHOULD = "should"
MAY = "may"


@dataclass
class Source:
    part: int | None
    block: int


@dataclass
class Step:
    id: str
    text: str
    part: int | None
    group: str | None
    modality: str | None = None
    condition: str | None = None
    source: Source | None = None


@dataclass
class Group:
    id: str
    part: int | None
    lead_in: str
    operator: str
    modality: str | None = None
    delay: str | None = None
    condition: str | None = None
    items: list[str] = field(default_factory=list)
    source: Source | None = None


@dataclass
class Setpoint:
    id: str
    name: str
    raw_value: str
    value: float | None
    units: str | None
    is_placeholder: bool
    declared_in_part: int | None


@dataclass
class Part:
    n: int
    title: str
    archetype: str
    is_inventory: bool
    block_start: int
    block_end: int = 0
    groups: list[str] = field(default_factory=list)
    statements: list[str] = field(default_factory=list)


@dataclass
class Finding:
    rule: str
    severity: str  # "error" | "warning" | "info"
    message: str
    part: int | None = None
    block: int | None = None


@dataclass
class Document:
    source_file: str
    equipment_class: str
    doc_type: str = "standalone"
    parts: list[Part] = field(default_factory=list)
    groups: list[Group] = field(default_factory=list)
    steps: list[Step] = field(default_factory=list)
    setpoints: list[Setpoint] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)

    def part(self, n: int) -> Part | None:
        return next((p for p in self.parts if p.n == n), None)

    def group(self, gid: str) -> Group | None:
        return next((g for g in self.groups if g.id == gid), None)

    def step(self, sid: str) -> Step | None:
        return next((s for s in self.steps if s.id == sid), None)

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(asdict(self), indent=indent, ensure_ascii=False)
