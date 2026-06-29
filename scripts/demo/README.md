# Demo video pipeline

Reproducible AI-narrated demo of Lattency, generated from `timeline.ts`:

1. **`generate-vo.ts`** — pulls the script lines from `timeline.ts`, calls
   ElevenLabs (voice: `Maryanne`, a warm Kenyan-influenced female narrator),
   writes one MP3 per cue to `/tmp/lattency-vo/` and a `manifest.json` with
   measured durations.
2. **`record-demo.ts`** — drives the production site at
   `https://lattency.vercel.app` through Playwright (headed Chromium so the
   real frame buffer is captured) and records a WebM at 1440×900. Each cue's
   on-screen action fires when its audio would start playing.
3. **`assemble.ts`** — concatenates per-cue MP3s with silence gaps via the
   ffmpeg `concat` filter into one WAV, then muxes that onto the WebM as
   H.264 + AAC inside an MP4.

## Run it

```bash
# Prereqs (one-time)
pnpm install
npx playwright install chromium      # FULL Chromium, not headless-shell

# ELEVENLABS_API_KEY must be in .env.local
echo 'ELEVENLABS_API_KEY=...' >> .env.local

# Generate
npx tsx scripts/demo/generate-vo.ts  # ~30s, costs a few ElevenLabs credits
npx tsx scripts/demo/record-demo.ts  # ~3 min, opens a visible Chromium window
npx tsx scripts/demo/assemble.ts     # ~10s
```

Final video lands at `/tmp/lattency-out/lattency-demo.mp4`. Also copied to
`public/demo/lattency-demo.mp4` (gitignored — not committed because of size).

## Editing the script

Edit `timeline.ts`. Each cue has:

- `text` — the spoken line (delete the matching MP3 from `/tmp/lattency-vo/`
  to force regeneration)
- `gapMs` — silence before the cue starts
- `action` — what to do on screen when the cue begins
  (`scrollTo` / `click` / `type` / `press` / `wait` / `sequence`)

## Known limitations of the v1 cut

The recorded video has some imperfections worth knowing about:

- **Modal click misses.** The contribute section's click on a station card
  (`button:has-text("Brew Bistro Kilimani")`) reports success in Playwright
  but the detail modal doesn't visibly open in the recording. Best guess:
  the smooth-scrolled directory is mid-animation when Playwright fires the
  click, so React doesn't register the modal open. Quick fix candidates:
  add a longer `wait` between `scrollTo` and the click, or use
  `getByRole("button", { name: /Brew Bistro/ })`.
- **Geographic toggle.** Same root cause — the toggle click during cue 13
  runs while the modal Escape may still be transitioning. Visually you see
  the masthead during this section rather than the geographic morph.
- **Highlight artefacts.** Playwright's `click` sometimes drags-selects
  text, leaving a blue highlight on the masthead toward the end of the
  recording.

If you re-record yourself in OBS, all three of these disappear. The
narration audio (`public/demo/lattency-vo-only.wav`) is usable as-is even
if you want to disable the AI voice and record your own over the screen.
