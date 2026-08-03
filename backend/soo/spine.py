"""The canonical PART spine.

All 16 example documents are one template instantiated repeatedly, so part titles
map onto a small set of archetypes in a consistent order. That makes "which parts
are missing from this document" a cheap, deterministic gap check — no language
understanding required. See docs/document-model.md §3.
"""
from __future__ import annotations

import re

# (archetype, title patterns). Order matters: first match wins.
ARCHETYPES: list[tuple[str, list[str]]] = [
    ("system_description", [r"system description", r"design intent"]),
    ("definitions", [r"definition", r"classification", r"application", r"philosophy",
                     r"operating modes", r"control logic", r"air-distribution config"]),
    ("responsibilities", [r"control responsibilit", r"controls responsibilit"]),
    ("setpoints", [r"adjustable setpoint", r"setpoints"]),
    ("availability", [r"availability"]),
    ("enable", [r"\benable\b"]),
    ("start_sequence", [r"start.?up sequence", r"start sequence", r"startup sequence",
                        r"initial .*start", r"normal start"]),
    ("staging", [r"capacity staging", r"staging", r"gradual addition"]),
    ("load_sharing", [r"load sharing", r"load-sharing"]),
    ("destaging", [r"de-?staging"]),
    ("redundancy", [r"redundancy"]),
    ("sensor_failure", [r"sensor failure"]),
    ("comm_failure", [r"loss of bms communication", r"communication"]),
    ("power_failure", [r"power failure", r"power restoration"]),
    ("emergency", [r"emergency"]),
    ("shutdown", [r"shutdown"]),
    ("fire_smoke", [r"fire-?alarm", r"smoke"]),
    ("failure_response", [r"failure", r"fault"]),
    ("alarms", [r"alarms?$", r"revised alarms"]),
    ("graphics", [r"bms graphics", r"graphics"]),
    ("trending", [r"trending", r"trend"]),
    ("commissioning", [r"testing and commissioning", r"commissioning"]),
    ("control_loop", []),  # default for the equipment-specific middle block
]

_COMPILED = [(name, [re.compile(p, re.I) for p in pats]) for name, pats in ARCHETYPES]

# Parts that are point inventories rather than control flow. These populate the IR
# collections and must not be rendered as flowchart nodes.
INVENTORY_ARCHETYPES = {"alarms", "graphics", "trending", "commissioning", "setpoints"}

# Archetypes expected in a standalone document, in canonical order.
CANONICAL_ORDER = [
    "system_description", "definitions", "responsibilities", "setpoints",
    "availability", "enable", "start_sequence", "control_loop", "staging",
    "load_sharing", "destaging", "redundancy", "failure_response",
    "sensor_failure", "comm_failure", "power_failure", "emergency", "shutdown",
    "alarms", "graphics", "trending", "commissioning",
]

# Absent from a standalone document, these are real defects rather than variation.
REQUIRED_ARCHETYPES = {
    "system_description", "setpoints", "alarms", "comm_failure", "power_failure",
    "commissioning",
}


def archetype(title: str) -> str:
    for name, patterns in _COMPILED:
        if any(p.search(title) for p in patterns):
            return name
    return "control_loop"


def is_inventory(arch: str) -> bool:
    return arch in INVENTORY_ARCHETYPES
