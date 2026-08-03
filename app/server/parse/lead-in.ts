/**
 * Lead-in sentence grammar.
 *
 * The corpus is built almost entirely from `lead-in sentence ending in a colon` +
 * `numbered list`. The lead-in declares what the list *means* — whether the items
 * are AND'd conditions, OR'd triggers, or an ordered sequence of actions.
 *
 * Patterns recovered from the 16 example documents; see docs/document-model.md.
 */
import type { Modality, Operator } from "@shared/ir";

/** Ordered — first match wins, so specific patterns precede general ones. */
const RULES: [RegExp, Operator][] = [
  // Explicit disjunction markers, before anything that could read as conjunction.
  [/one or more of the following/i, "OR"],
  [/any of the following/i, "OR"],
  [/either of the following/i, "OR"],

  // Enumerated alternatives — "the controlled variable may be: a, b, c".
  [/\bmay be:?$/i, "OR"],
  [/\bshall be one of\b/i, "OR"],

  // Enumerated properties — "...operate the units with approximately equal:".
  [/\bapproximately equal:?$/i, "INVENTORY"],
  [/\bequal:?$/i, "INVENTORY"],

  // Ordered action sequences.
  [/^upon\b/i, "SEQUENCE"],
  [/^if\b/i, "SEQUENCE"],
  [/^during\b/i, "SEQUENCE"],
  [/^while\b/i, "SEQUENCE"],
  [/^when .+ is (staged|started|added|enabled|selected)\b/i, "SEQUENCE"],
  [/^(the )?(start|startup|shutdown|stop) sequence shall\b/i, "SEQUENCE"],
  [/shall (be )?(execute|perform|follow|initiate)\w*\s+the following (sequence|steps)/i, "SEQUENCE"],
  [/in the following order/i, "SEQUENCE"],

  // Inventories — point lists, not control flow. Must not become graph nodes.
  [/shall (monitor|trend|display|demonstrate|record|log|indicate)\b/i, "INVENTORY"],
  [/shall (include|comprise|consist of)\b/i, "INVENTORY"],
  [/^the system may include/i, "INVENTORY"],
  [/shall be (trended|monitored|displayed|provided)\b/i, "INVENTORY"],
  [/^the following (setpoints|points|parameters)\b/i, "INVENTORY"],
  [/graphics shall\b/i, "INVENTORY"],

  // Conditions AND'd together.
  [/shall be considered available when/i, "AND"],
  [/shall be considered\b.*\bwhen/i, "AND"],
  [/^before\b.*\bshall confirm/i, "AND"],
  [/shall confirm/i, "AND"],
  [/alarm shall be (generated|initiated|annunciated) when/i, "AND"],
  [/\b(shall|should|may)\s+(not\s+)?(be\s+)?(increase|decrease|lower|raise|reset|rise|fall)\w*\b.*\bwhen/i, "OR"],
  [/shall (only )?(operate|start|run|enable)\b.*\bwhen (all|each)/i, "AND"],
  [/\bwhen all of the following/i, "AND"],
  [/\bwhen the following/i, "AND"],

  // Context prefixes: a scope or operating state, then what happens in it.
  // After the AND block, so "Where X is considered available when:" still reads
  // as a condition set rather than a scope.
  [/\bassumed to include\b/i, "INVENTORY"],
  [/^where\b/i, "SEQUENCE"],
  [/^when\b/i, "SEQUENCE"],
  [/^at\b/i, "SEQUENCE"],
  [/^as\b/i, "SEQUENCE"],
  [/^for\b/i, "SEQUENCE"],
  [/^unless\b/i, "SEQUENCE"],
  [/^in (the )?event\b/i, "SEQUENCE"],
  [/^following\b/i, "SEQUENCE"],
  [/^after\b/i, "SEQUENCE"],

  // Generic fallbacks.
  [/\b(shall|should|may)\b.*\b(when|if|unless|upon)\b/i, "AND"],
  [/^(the )?bms shall\b/i, "SEQUENCE"],
  [/\bshall\b/i, "SEQUENCE"],
  // No conditional keyword and no directive verb: it is enumerating things.
  [/\b(should|may)\b/i, "INVENTORY"],
];

const MODALITY: [RegExp, Modality][] = [
  [/\bshall not\b/i, "shall not"],
  [/\bshall\b/i, "shall"],
  [/\bshould not\b/i, "should"],
  [/\bshould\b/i, "should"],
  [/\bmay not\b/i, "may"],
  [/\bmay\b/i, "may"],
];

const DELAY_RE =
  /\b(?:for|after)\s+(?:the\s+)?(adjustable\s+[\w\- ]*?delay|adjustable\s+[\w\- ]*?time|\d+\s*(?:s|sec|second|min|minute|hour)s?\b[\w\- ]*)/i;

const CONDITION_RE =
  /\bwhere\s+(provided|available|applicable|required|installed|fitted|used)\b/i;

export function classify(leadIn: string): Operator {
  const text = leadIn.replace(/\s+/g, " ").replace(/:\s*$/, "").trim();
  for (const [pattern, op] of RULES) if (pattern.test(text)) return op;
  return "UNKNOWN";
}

export function modalityOf(text: string): Modality {
  for (const [pattern, mod] of MODALITY) if (pattern.test(text)) return mod;
  return null;
}

export function delayOf(text: string): string | null {
  const m = DELAY_RE.exec(text);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

export function conditionOf(text: string): string | null {
  const m = CONDITION_RE.exec(text);
  return m ? m[0].replace(/\s+/g, " ").toLowerCase() : null;
}

/** A lead-in introduces a list. In this corpus it always ends in a colon. */
export function isLeadIn(text: string): boolean {
  return text.trimEnd().endsWith(":");
}
