"""Lead-in sentence grammar.

The corpus is built almost entirely from `lead-in sentence ending in a colon` +
`numbered list`. The lead-in declares what the list *means* — whether the items
are AND'd conditions, OR'd triggers, or an ordered sequence of actions. Getting
this classification right is most of the parse.

Patterns were recovered from the example documents; see docs/document-model.md §2.
"""
from __future__ import annotations

import re

from .model import AND, OR, SEQUENCE, INVENTORY, UNKNOWN
from .model import SHALL, SHALL_NOT, SHOULD, MAY

# Ordered — first match wins, so specific patterns precede general ones.
RULES: list[tuple[str, str]] = [
    # OR before AND: "one or more of the following" is the explicit disjunction marker.
    (r"one or more of the following", OR),
    (r"any of the following", OR),
    (r"either of the following", OR),

    # Enumerated alternatives — "the controlled variable may be: a, b, c".
    (r"\bmay be:?$", OR),
    (r"\bshall be one of\b", OR),

    # Enumerated properties — "...operate the units with approximately equal:".
    (r"\bapproximately equal:?$", INVENTORY),
    (r"\bequal:?$", INVENTORY),

    # Ordered action sequences.
    (r"^upon\b", SEQUENCE),
    (r"^if\b", SEQUENCE),
    (r"^during\b", SEQUENCE),
    (r"^while\b", SEQUENCE),
    (r"^when .+ is (staged|started|added|enabled|selected)\b", SEQUENCE),
    (r"^(the )?(start|startup|shutdown|stop) sequence shall\b", SEQUENCE),
    (r"shall (be )?(execute|perform|follow|initiate)\w*\s+the following (sequence|steps)", SEQUENCE),
    (r"in the following order", SEQUENCE),

    # Inventories — point lists, not control flow. Must not become graph nodes.
    (r"shall (monitor|trend|display|demonstrate|record|log|indicate)\b", INVENTORY),
    (r"shall (include|comprise|consist of)\b", INVENTORY),
    (r"^the system may include", INVENTORY),
    (r"shall be (trended|monitored|displayed|provided)\b", INVENTORY),
    (r"^the following (setpoints|points|parameters)\b", INVENTORY),
    (r"graphics shall\b", INVENTORY),

    # Conditions AND'd together.
    (r"shall be considered available when", AND),
    (r"shall be considered\b.*\bwhen", AND),
    (r"^before\b.*\bshall confirm", AND),
    (r"shall confirm", AND),
    (r"alarm shall be (generated|initiated|annunciated) when", AND),
    (r"\b(shall|should|may)\s+(not\s+)?(be\s+)?"
     r"(increase|decrease|lower|raise|reset|rise|fall)\w*\b.*\bwhen", OR),
    (r"shall (only )?(operate|start|run|enable)\b.*\bwhen (all|each)", AND),
    (r"\bwhen all of the following", AND),
    (r"\bwhen the following", AND),

    # Context prefixes: a scope or operating state, followed by what happens in it.
    # Placed after the AND block so "Where X is considered available when:" still
    # reads as a condition set rather than a scope.
    (r"\bassumed to include\b", INVENTORY),
    (r"^where\b", SEQUENCE),
    (r"^when\b", SEQUENCE),
    (r"^at\b", SEQUENCE),
    (r"^as\b", SEQUENCE),
    (r"^for\b", SEQUENCE),
    (r"^unless\b", SEQUENCE),
    (r"^in (the )?event\b", SEQUENCE),
    (r"^following\b", SEQUENCE),
    (r"^after\b", SEQUENCE),

    # Generic conditional / directive fallbacks.
    (r"\b(shall|should|may)\b.*\b(when|if|unless|upon)\b", AND),
    (r"^(the )?bms shall\b", SEQUENCE),
    (r"\bshall\b", SEQUENCE),
    # No conditional keyword and no directive verb: it is enumerating things.
    (r"\b(should|may)\b", INVENTORY),
]

_COMPILED = [(re.compile(p, re.I), op) for p, op in RULES]

_MODALITY = [
    (re.compile(r"\bshall not\b", re.I), SHALL_NOT),
    (re.compile(r"\bshall\b", re.I), SHALL),
    (re.compile(r"\bshould not\b", re.I), SHOULD),
    (re.compile(r"\bshould\b", re.I), SHOULD),
    (re.compile(r"\bmay not\b", re.I), MAY),
    (re.compile(r"\bmay\b", re.I), MAY),
]

_DELAY = re.compile(
    r"\b(?:for|after)\s+(?:the\s+)?(adjustable\s+[\w\- ]*?delay"
    r"|adjustable\s+[\w\- ]*?time"
    r"|\d+\s*(?:s|sec|second|min|minute|hour)s?\b[\w\- ]*)",
    re.I,
)

_CONDITION = re.compile(
    r"\bwhere\s+(provided|available|applicable|required|installed|fitted|used)\b", re.I
)


def classify(lead_in: str) -> str:
    """Return the logical operator a lead-in imposes on the list beneath it."""
    text = " ".join(lead_in.split()).rstrip(":").strip()
    for pattern, op in _COMPILED:
        if pattern.search(text):
            return op
    return UNKNOWN


def modality(text: str) -> str | None:
    for pattern, mod in _MODALITY:
        if pattern.search(text):
            return mod
    return None


def delay(text: str) -> str | None:
    m = _DELAY.search(text)
    return " ".join(m.group(1).split()) if m else None


def condition(text: str) -> str | None:
    m = _CONDITION.search(text)
    return " ".join(m.group(0).split()).lower() if m else None


def is_lead_in(text: str) -> bool:
    """A lead-in introduces a list. In this corpus it always ends in a colon."""
    return text.rstrip().endswith(":")
