// Single source of truth for the demo video.
// Each cue: an MP3 clip generated from `text` via ElevenLabs, and a screen
// action that runs after a `gapMs` pause once the previous clip finishes.
// Durations are measured at runtime; the video assembler concatenates the
// MP3s with the gaps as silence and pads the WebM screen recording to match.

export type Cue = {
  id: string;
  text: string;
  /** Silence (ms) before this cue's audio starts. */
  gapMs: number;
  /** Action to run on the page when this cue STARTS speaking. */
  action: ScreenAction;
};

export type ScreenAction =
  | { kind: "scrollTo"; /** Fraction of page height 0..1. */ pct: number; smooth?: boolean }
  | { kind: "click"; selector: string }
  | { kind: "type"; selector: string; value: string; perCharMs?: number }
  | { kind: "press"; key: string }
  | { kind: "wait"; ms: number }
  | { kind: "sequence"; actions: ScreenAction[] }
  | { kind: "noop" };

export const CUES: Cue[] = [
  // ──────────────────────────────────────────────────────────── Hook (0:00)
  {
    id: "01_hook",
    gapMs: 400,
    text:
      "In Nairobi, finding a café with workable wifi is a guessing game. Lattency turns it into a metro map. Cafés are stations. The three lines are speed tiers.",
    action: { kind: "scrollTo", pct: 0 },
  },
  // ─────────────────────────────────────────────────── Ride the lines (~15s)
  {
    id: "02_express",
    gapMs: 1200,
    text:
      "Scroll, and the camera takes you down each line. Express stations — fifty megabits or more. About Thyme, Connect Coffee, Savanna, Karen Blixen — four stops, end to end.",
    action: { kind: "scrollTo", pct: 0.18, smooth: true },
  },
  {
    id: "03_local",
    gapMs: 1500,
    text:
      "Local line — the everyday backbone. Six stops, mostly between twenty and forty megabits.",
    action: { kind: "scrollTo", pct: 0.30, smooth: true },
  },
  {
    id: "04_suspended",
    gapMs: 1500,
    text:
      "And the suspended line. Brew Bistro Kilimani, Dormans Standard Street — under ten megabits. Service intermittent.",
    action: { kind: "scrollTo", pct: 0.43, smooth: true },
  },
  // ─────────────────────────────────────────────────────────── Finale (5s)
  {
    id: "05_finale",
    gapMs: 1200,
    text:
      "The schematic isn't Nairobi-specific. The same engine could map any city's wifi the same way. Lagos. Cape Town. Yours.",
    action: { kind: "scrollTo", pct: 0.58, smooth: true },
  },
  // ─────────────────────────────────────────────────────── Contribute (45s)
  {
    id: "06_contribute_intro",
    gapMs: 1800,
    text:
      "Anyone with a connection can contribute a measurement. Brew Bistro Kilimani is on the suspended line — under ten megabits.",
    action: { kind: "scrollTo", pct: 0.82, smooth: true },
  },
  {
    id: "07_open_detail",
    gapMs: 800,
    text:
      "Here's the speed distribution across the day. The dashed line at fifty megabits is the express threshold.",
    action: { kind: "click", selector: 'button:has-text("Brew Bistro Kilimani")' },
  },
  {
    id: "08_form_preview",
    gapMs: 1200,
    text:
      "As I type, the form tells me which line my reading lands on. A hundred megabits would put Brew Bistro on the Express line.",
    action: {
      kind: "type",
      selector: 'input[placeholder="50"]',
      value: "100",
      perCharMs: 250,
    },
  },
  {
    id: "09_form_up_ping",
    gapMs: 200,
    text: "Upload, twenty five. Ping, ten.",
    action: {
      kind: "sequence",
      actions: [
        { kind: "type", selector: 'input[placeholder="12"]', value: "25", perCharMs: 180 },
        { kind: "type", selector: 'input[placeholder="20"]', value: "10", perCharMs: 180 },
      ],
    },
  },
  {
    id: "10_submit",
    gapMs: 600,
    text:
      "That POST goes to Aurora. The materialized view refreshes concurrently. The next read sees the new tier.",
    action: { kind: "click", selector: 'button:has-text("Log this reading")' },
  },
  {
    id: "11_tier_flip",
    gapMs: 1500,
    text: "The same data, one second later, on a different line.",
    // Closing the detail drawer with Escape — the line below the dimmer
    // refreshes to show the new tier, AND the dimmer goes away so the
    // upcoming Geographic toggle click in cue 13 isn't intercepted.
    action: { kind: "press", key: "Escape" },
  },
  // ────────────────────────────────────────────── Schematic ↔ Geographic (40s)
  {
    id: "12_geo_toggle",
    gapMs: 1500,
    text:
      "The same twelve cafés, plotted on their real lat-long coordinates. This is what the engine actually knows about them — geography, served by PostGIS.",
    action: { kind: "scrollTo", pct: 0.35, smooth: true },
  },
  {
    id: "13_geo_call",
    gapMs: 1500,
    text:
      "Cafés near me? That's an ST DWithin call. Two hundred metres of Postgres geography against an Aurora cluster that scales to zero ACUs when idle.",
    action: { kind: "click", selector: 'button:has-text("Geographic")' },
  },
  // ──────────────────────────────────────────────────────────── Stack (30s)
  {
    id: "14_stack",
    gapMs: 1800,
    text:
      "Amazon Aurora PostgreSQL Serverless v2 in eu-north-1. We picked Aurora over Aurora DSQL and DynamoDB because we needed PostGIS for spatial queries. A materialized view tiers each café by median measurement.",
    action: { kind: "scrollTo", pct: 0, smooth: true },
  },
  {
    id: "15_close",
    gapMs: 1000,
    text:
      "Twelve stations today. The next twelve thousand are next.",
    action: { kind: "wait", ms: 2500 },
  },
];
