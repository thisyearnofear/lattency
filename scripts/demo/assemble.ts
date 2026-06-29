// Concatenates the per-cue MP3s with silence gaps into a single audio track,
// then muxes it onto the WebM screen recording from Playwright, outputting
// a clean H.264/AAC MP4 ready to upload to YouTube.

import "../bootstrap-env";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { CUES } from "./timeline";

const VO_DIR = "/tmp/lattency-vo";
const VIDEO_DIR = "/tmp/lattency-recording";
const OUT_DIR = "/tmp/lattency-out";
const FINAL = `${OUT_DIR}/lattency-demo.mp4`;

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

function sh(cmd: string, silent = false): string {
  if (!silent) console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8" });
}

function durationOf(path: string): number {
  return Number(sh(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`, true).trim());
}

function findLatestWebm(): string {
  const files = readdirSync(VIDEO_DIR)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => ({ f, m: statSync(`${VIDEO_DIR}/${f}`).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (files.length === 0) throw new Error(`No .webm in ${VIDEO_DIR}`);
  return `${VIDEO_DIR}/${files[0].f}`;
}

async function main() {
  // 1. Build concatenated audio: silence(gap) + cue.mp3 for each cue.
  const concatList: string[] = [];
  let i = 0;
  for (const cue of CUES) {
    const silenceMp3 = `${OUT_DIR}/silence-${i++}.mp3`;
    const seconds = (cue.gapMs / 1000).toFixed(3);
    if (cue.gapMs > 0) {
      sh(
        `ffmpeg -y -hide_banner -loglevel error -f lavfi -i anullsrc=r=44100:cl=mono -t ${seconds} -q:a 9 -acodec libmp3lame "${silenceMp3}"`,
        true,
      );
      concatList.push(silenceMp3);
    }
    const clip = `${VO_DIR}/${cue.id}.mp3`;
    if (!existsSync(clip)) throw new Error(`missing clip: ${clip}`);
    concatList.push(clip);
  }
  const listFile = `${OUT_DIR}/audio-list.txt`;
  writeFileSync(listFile, concatList.map((p) => `file '${p}'`).join("\n"));
  // Build the audio via the `concat` filter (not the demuxer). The demuxer
  // either preserves broken DTS (`-c copy`) or re-encodes without rebuilding
  // timestamps. The filter unconditionally normalises into a single stream
  // with correct duration. Each cue contributes (silence, then speech) when
  // gapMs > 0.
  // WAV (uncompressed PCM) not MP3 — the LAME encoder occasionally strips
  // leading silence, and the concat demuxer can't fix the resulting
  // duration metadata. WAV preserves the silence verbatim.
  const fullAudio = `${OUT_DIR}/lattency-vo-full.wav`;
  const inputs: string[] = [];
  const filterParts: string[] = [];
  let streamIdx = 0;
  let silenceIdx = 0;
  for (const cue of CUES) {
    if (cue.gapMs > 0) {
      const silenceMp3 = `${OUT_DIR}/silence-${silenceIdx++}.mp3`;
      inputs.push(`-i "${silenceMp3}"`);
      filterParts.push(`[${streamIdx}:a]`);
      streamIdx++;
    }
    inputs.push(`-i "${VO_DIR}/${cue.id}.mp3"`);
    filterParts.push(`[${streamIdx}:a]`);
    streamIdx++;
  }
  const filter = `${filterParts.join("")}concat=n=${streamIdx}:v=0:a=1[aout]`;
  sh(
    `ffmpeg -y -hide_banner -loglevel error ` +
      inputs.join(" ") +
      ` -filter_complex "${filter}" -map "[aout]" ` +
      `-c:a pcm_s16le -ar 44100 -ac 1 "${fullAudio}"`,
  );
  const audioDur = durationOf(fullAudio);
  console.log(`audio: ${audioDur.toFixed(2)}s`);

  // 2. Find the WebM recording.
  const webm = findLatestWebm();
  const videoDur = durationOf(webm);
  console.log(`video: ${videoDur.toFixed(2)}s (raw webm: ${webm})`);

  // 3. Trim/pad and mux. If video is longer than audio we trim; if shorter,
  // we let -shortest cut the audio. Encode to H.264/AAC for YouTube.
  sh(
    `ffmpeg -y -hide_banner -loglevel error ` +
      `-i "${webm}" -i "${fullAudio}" ` +
      `-map 0:v:0 -map 1:a:0 ` +
      `-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p ` +
      `-c:a aac -b:a 192k ` +
      `-shortest -movflags +faststart "${FINAL}"`,
  );

  const finalDur = durationOf(FINAL);
  console.log(`\nfinal: ${FINAL}`);
  console.log(`duration: ${finalDur.toFixed(2)}s (${(finalDur / 60).toFixed(2)} min)`);
  if (finalDur > 180) {
    console.log("⚠️  over 3:00 hackathon hard limit. trim cues and re-run.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
