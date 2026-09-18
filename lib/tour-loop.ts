/** Shared product-loop beats — used by the reel and the mechanics strip. */

export const LOOP_STEPS = [
  {
    n: "01",
    verb: "Tap",
    caption:
      "Every dot is a real place to work. Tap a station.",
  },
  {
    n: "02",
    verb: "Read",
    caption:
      "Its verified readings open — median, jitter, sample size. Nothing claimed, everything measured.",
  },
  {
    n: "03",
    verb: "Test",
    caption:
      "Run a real speed test from where you're sitting. A round-trip to the edge can't be faked.",
  },
  {
    n: "04",
    verb: "Land",
    caption:
      "Your reading extends the line. The new station appears the instant you submit — no refresh.",
  },
  {
    n: "05",
    verb: "Earn",
    caption:
      "Verified readings close bounties. NIM lands in your Nimiq Pay wallet.",
  },
] as const;

export const LOOP_DURATIONS = [3200, 4200, 5200, 3600, 4300] as const;
