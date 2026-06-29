// Generates one MP3 per cue via ElevenLabs. Skips clips that already exist
// so re-runs are cheap. Prints durations for the recorder/assembler.

import "../bootstrap-env";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { CUES } from "./timeline";

const VOICE_ID = "hrMENUPSbAbVQk6jkV5k"; // Maryanne — warm, calm, Kenyan-influenced
const OUT_DIR = "/tmp/lattency-vo";
const MODEL = "eleven_multilingual_v2";

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  throw new Error("ELEVENLABS_API_KEY not in env — check .env.local");
}

async function generate(id: string, text: string): Promise<string> {
  const out = join(OUT_DIR, `${id}.mp3`);
  if (existsSync(out) && statSync(out).size > 1024) {
    return out;
  }
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.78,
          style: 0.18,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`tts ${id}: ${res.status} ${await res.text()}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(out, buf);
  return out;
}

function durationOf(path: string): number {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`,
    { encoding: "utf8" },
  ).trim();
  return Number(out);
}

async function main() {
  console.log(`generating ${CUES.length} voice cues with voice ${VOICE_ID}\n`);
  let total = 0;
  const rows: Array<{ id: string; duration: number; gapMs: number; words: number; text: string }> = [];
  for (const cue of CUES) {
    process.stdout.write(`  ${cue.id} `);
    const path = await generate(cue.id, cue.text);
    const d = durationOf(path);
    rows.push({
      id: cue.id,
      duration: d,
      gapMs: cue.gapMs,
      words: cue.text.split(/\s+/).length,
      text: cue.text.slice(0, 60),
    });
    total += d + cue.gapMs / 1000;
    console.log(`${d.toFixed(2)}s · ${cue.text.split(/\s+/).length} words`);
  }
  console.log(`\ntotal speech: ${total.toFixed(1)}s · ${(total / 60).toFixed(2)} min`);
  if (total > 175) {
    console.log("⚠️  over 2:55 target. trim cues if needed.");
  }
  writeFileSync(
    join(OUT_DIR, "manifest.json"),
    JSON.stringify({ voiceId: VOICE_ID, model: MODEL, total, rows }, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
