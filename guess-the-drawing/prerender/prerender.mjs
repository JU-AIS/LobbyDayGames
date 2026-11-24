// Video -> one frame every 3 s -> Claude Haiku 5.5 -> rounds/<word>/guesses.json + rounds/rounds.js
// Usage: npm start                     rounds that have no guesses.json yet
//        npm start -- --force          all rounds again
//        npm start -- ../rounds/horse  one round (always re-run)
//        npm start -- --dry            no API calls: show which frames would be sent
// The results are committed, so every player sees exactly the same AI.
import Anthropic from "@anthropic-ai/sdk";
import ffmpegStatic from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = "claude-haiku-5-5";
const INTERVAL = 3; // seconds between AI guesses
const PARALLEL = 5;
const PROMPT =
  "Someone is drawing a picture in Paint and this is how far they have got. " +
  "What are they drawing? Answer with exactly one lowercase English noun and nothing else. " +
  "If the canvas is empty, answer: nothing";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FORCE = args.includes("--force");
const picked = args.filter((a) => !a.startsWith("--"));

const ffmpeg = ffmpegStatic || "ffmpeg";
const roundsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "rounds");
const allDirs = fs.readdirSync(roundsDir, { withFileTypes: true }).filter((d) => d.isDirectory())
  .map((d) => path.join(roundsDir, d.name));
const dirs = picked.length ? picked.map((p) => path.resolve(p))
  : allDirs.filter((d) => FORCE || !fs.existsSync(path.join(d, "guesses.json")));

if (!DRY && !process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY. Put it in prerender/.env (never commit it), or use --dry.");
  process.exit(1);
}
const client = DRY ? null : new Anthropic();

const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// Any API failure (timeout, 429 after SDK retries, ...) becomes a gap instead of killing the whole run.
async function guessFrame(file) {
  try { return await askHaiku(file); } catch (e) { console.warn(`  ${path.basename(file)}: ${e.message}`); return null; }
}

async function askHaiku(file) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low" },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: fs.readFileSync(file, "base64") } },
        { type: "text", text: PROMPT },
      ],
    }],
  });
  if (res.stop_reason === "refusal") return null;
  const text = res.content.find((b) => b.type === "text")?.text ?? "";
  return text.trim().split(/\s+/)[0].toLowerCase().replace(/[^\p{L}\p{N}-]/gu, "") || null;
}

// One round as the game sees it. aiCorrectAt = time of the AI's first right guess (null = never).
// The game starts its 6 s window there, and the too-early warning uses it.
// Exact match on word/synonyms here; the game does fuzzy matching for players.
function loadRound(dir) {
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8")); } catch {}
  const word = meta.word ?? path.basename(dir);
  const synonyms = meta.synonyms ?? [];
  const guesses = JSON.parse(fs.readFileSync(path.join(dir, "guesses.json"), "utf8"));
  const answers = [word, ...synonyms].map(norm);
  const first = guesses.find((g) => answers.includes(norm(g.guess)));
  return { word, synonyms, video: `rounds/${path.basename(dir)}/video.mp4`, guesses, aiCorrectAt: first ? first.t : null };
}

for (const dir of dirs) {
  const video = path.join(dir, "video.mp4");
  if (!fs.existsSync(video)) { console.warn(`skip ${dir}: no video.mp4`); continue; }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtd-"));
  // fps=1: frame k (0-based) is the canvas at second k; we send every INTERVAL-th one (t = 3, 6, 9, ...).
  // 512px is plenty for a sketch and keeps tokens low.
  execFileSync(ffmpeg, ["-loglevel", "error", "-i", video, "-vf", "fps=1,scale=512:-2", "-q:v", "4", path.join(tmp, "%04d.jpg")]);
  const seconds = fs.readdirSync(tmp).length;
  const times = [];
  for (let t = INTERVAL; t < seconds; t += INTERVAL) times.push(t);
  const frameOf = (t) => path.join(tmp, String(t + 1).padStart(4, "0") + ".jpg");

  if (DRY) {
    console.log(`${path.basename(dir)}: ${seconds}s video, would send ${times.length} frames at t=${times.join(",")}`);
    fs.rmSync(tmp, { recursive: true });
    continue;
  }

  const guesses = [];
  for (let i = 0; i < times.length; i += PARALLEL) {
    const batch = times.slice(i, i + PARALLEL);
    const answers = await Promise.all(batch.map((t) => guessFrame(frameOf(t))));
    batch.forEach((t, j) => answers[j] ? guesses.push({ t, guess: answers[j] }) : console.warn(`  t=${t}: no guess, skipped`));
  }
  fs.rmSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(dir, "guesses.json"), JSON.stringify(guesses, null, 2) + "\n");

  const r = loadRound(dir);
  const warn = r.aiCorrectAt !== null && r.aiCorrectAt < seconds * 0.3 ? "  <-- TOO EARLY?" : "";
  console.log(`${path.basename(dir)}: ${seconds}s video, AI right at ${r.aiCorrectAt ?? "never"}s${warn}`);
  console.log("  " + guesses.map((g) => `${g.t}s ${g.guess}`).join(" | "));
}

if (DRY) process.exit(0);

// rounds.js: every round that has guesses.json, so the game runs from file:// (no fetch, no server).
const rounds = allDirs.filter((d) => fs.existsSync(path.join(d, "guesses.json"))).map(loadRound);
fs.writeFileSync(path.join(roundsDir, "rounds.js"),
  "// Generated by prerender/prerender.mjs. Do not edit by hand.\nwindow.ROUNDS = " + JSON.stringify(rounds, null, 2) + ";\n");
console.log(`wrote rounds/rounds.js (${rounds.length} rounds)`);
