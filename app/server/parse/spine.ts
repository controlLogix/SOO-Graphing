/**
 * The canonical PART spine.
 *
 * The example documents are one template instantiated repeatedly, so part titles
 * map onto a small set of archetypes in a consistent order. That makes "which
 * parts are missing" a cheap, deterministic check with no language understanding
 * involved — and it already finds real defects in the corpus.
 */

const ARCHETYPES: [string, RegExp[]][] = [
  ["system_description", [/system description/i, /design intent/i]],
  ["definitions", [/definition/i, /classification/i, /application/i, /philosophy/i,
                   /operating modes/i, /control logic/i, /air-distribution config/i]],
  ["responsibilities", [/control responsibilit/i, /controls responsibilit/i]],
  ["setpoints", [/adjustable setpoint/i, /setpoints/i]],
  ["availability", [/availability/i]],
  ["enable", [/\benable\b/i]],
  ["start_sequence", [/start.?up sequence/i, /start sequence/i, /startup sequence/i,
                      /initial .*start/i, /normal start/i]],
  ["staging", [/capacity staging/i, /staging/i, /gradual addition/i]],
  ["load_sharing", [/load sharing/i, /load-sharing/i]],
  ["destaging", [/de-?staging/i]],
  ["redundancy", [/redundancy/i]],
  ["sensor_failure", [/sensor failure/i]],
  ["comm_failure", [/loss of bms communication/i, /communication/i]],
  ["power_failure", [/power failure/i, /power restoration/i]],
  ["emergency", [/emergency/i]],
  ["shutdown", [/shutdown/i]],
  ["fire_smoke", [/fire-?alarm/i, /smoke/i]],
  ["failure_response", [/failure/i, /fault/i]],
  ["alarms", [/alarms?$/i, /revised alarms/i]],
  ["graphics", [/bms graphics/i, /graphics/i]],
  ["trending", [/trending/i, /trend/i]],
  ["commissioning", [/testing and commissioning/i, /commissioning/i]],
];

/** Point inventories rather than control flow — they draw no nodes. */
export const INVENTORY_ARCHETYPES = new Set([
  "alarms", "graphics", "trending", "commissioning", "setpoints",
]);

/** Expected in a standalone document, in canonical order. */
export const CANONICAL_ORDER = [
  "system_description", "definitions", "responsibilities", "setpoints",
  "availability", "enable", "start_sequence", "control_loop", "staging",
  "load_sharing", "destaging", "redundancy", "failure_response",
  "sensor_failure", "comm_failure", "power_failure", "emergency", "shutdown",
  "alarms", "graphics", "trending", "commissioning",
];

/** Absent from a standalone document, these are defects rather than variation. */
export const REQUIRED_ARCHETYPES = new Set([
  "system_description", "setpoints", "alarms", "comm_failure", "power_failure",
  "commissioning",
]);

export function archetypeOf(title: string): string {
  for (const [name, patterns] of ARCHETYPES) {
    if (patterns.some((p) => p.test(title))) return name;
  }
  return "control_loop";
}

export function isInventory(archetype: string): boolean {
  return INVENTORY_ARCHETYPES.has(archetype);
}

export function humanArchetype(archetype: string): string {
  return archetype.replace(/_/g, " ");
}
