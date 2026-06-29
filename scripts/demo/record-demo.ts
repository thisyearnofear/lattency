// Drives a headless Chromium through the demo using Playwright, recording a
// WebM that aligns with the pre-generated voice-over cues. Timing per cue =
// gapMs (silence before) + clip duration (from /tmp/lattency-vo/manifest.json).
// The screen action runs at the moment the cue's audio STARTS.

import "../bootstrap-env";
import { readFileSync, existsSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { CUES, type ScreenAction } from "./timeline";

const MANIFEST_PATH = "/tmp/lattency-vo/manifest.json";
const VIDEO_DIR = "/tmp/lattency-recording";
const TARGET_URL = process.env.DEMO_URL ?? "https://lattency.vercel.app/";

if (!existsSync(MANIFEST_PATH)) {
  throw new Error(
    `Missing ${MANIFEST_PATH}. Run scripts/demo/generate-vo.ts first.`,
  );
}

interface ManifestRow {
  id: string;
  duration: number;
  gapMs: number;
}
const manifest: { rows: ManifestRow[] } = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const durationByCue = new Map(manifest.rows.map((r) => [r.id, r.duration]));

async function runAction(page: Page, action: ScreenAction): Promise<void> {
  switch (action.kind) {
    case "scrollTo": {
      await page.evaluate(
        ({ pct, smooth }: { pct: number; smooth: boolean }) => {
          const target = (document.body.scrollHeight - window.innerHeight) * pct;
          window.scrollTo({ top: target, behavior: smooth ? "smooth" : "instant" });
        },
        { pct: action.pct, smooth: !!action.smooth },
      );
      // give the smooth scroll a moment to settle
      if (action.smooth) await page.waitForTimeout(450);
      break;
    }
    case "click": {
      const locator = page.locator(action.selector).first();
      try {
        await locator.scrollIntoViewIfNeeded({ timeout: 1500 });
        await locator.click({ timeout: 4000 });
      } catch (e) {
        console.warn(`  click failed for ${action.selector}: ${(e as Error).message}`);
      }
      break;
    }
    case "type": {
      const locator = page.locator(action.selector).first();
      try {
        await locator.scrollIntoViewIfNeeded({ timeout: 1500 });
        await locator.click({ timeout: 4000 });
        await locator.fill("");
        for (const ch of action.value) {
          await locator.type(ch);
          await page.waitForTimeout(action.perCharMs ?? 200);
        }
      } catch (e) {
        console.warn(`  type failed for ${action.selector}: ${(e as Error).message}`);
      }
      break;
    }
    case "press": {
      await page.keyboard.press(action.key);
      break;
    }
    case "wait": {
      await page.waitForTimeout(action.ms);
      break;
    }
    case "sequence": {
      for (const sub of action.actions) await runAction(page, sub);
      break;
    }
    case "noop":
      break;
  }
}

async function main() {
  const browser = await chromium.launch({
    // Headed Chromium — `chromium_headless_shell` doesn't paint to a buffer
    // we can capture, so recordVideo produces an all-white WebM. The full
    // chromium binary (available with `playwright install chromium`) paints
    // a real frame buffer that recordVideo can read.
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--hide-scrollbars",
      "--mute-audio",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  console.log(`opening ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: "networkidle", timeout: 60_000 });
  // Let GSAP fonts + initial paint settle.
  await page.waitForTimeout(2500);

  for (const cue of CUES) {
    const dur = durationByCue.get(cue.id);
    if (dur === undefined) {
      console.warn(`! no duration for cue ${cue.id} — using 2s`);
    }
    // Silence gap BEFORE the cue starts.
    if (cue.gapMs > 0) await page.waitForTimeout(cue.gapMs);

    const startedAt = Date.now();
    console.log(
      `▶ ${cue.id.padEnd(20)} (${(dur ?? 2).toFixed(1)}s speech, action: ${cue.action.kind})`,
    );

    // Fire the action without waiting for it, so it overlaps with the speech.
    const actionPromise = runAction(page, cue.action).catch((e) => {
      console.warn(`  action error: ${(e as Error).message}`);
    });

    // Hold the page on screen for the full speech duration.
    const speechMs = Math.round((dur ?? 2) * 1000);
    await Promise.all([actionPromise, page.waitForTimeout(speechMs)]);

    const drift = Date.now() - startedAt - cue.gapMs - speechMs;
    if (Math.abs(drift) > 50) console.log(`  drift: ${drift}ms`);
  }

  // Hold for a final beat at the end so the outro doesn't cut.
  await page.waitForTimeout(1500);

  console.log("\nclosing browser, finalizing video…");
  const videoPath = page.video() ? await page.video()!.path() : null;
  await context.close();
  await browser.close();
  if (videoPath) console.log(`raw recording: ${videoPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
