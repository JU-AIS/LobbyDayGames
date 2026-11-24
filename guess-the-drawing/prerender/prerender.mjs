// Video -> 1 frame/s -> Claude Haiku 5.5 -> rounds/<word>/guesses.json
// Usage: npm start                    (all rounds)
//        npm start -- ../rounds/horse (one round)
import Anthropic from "@anthropic-ai/sdk";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = "claude-haiku-5-5";
const PARALLEL = 5;
const PROMPT =
  "Someone is drawing a picture in Paint and this is how far they have got. " +
  "What are they drawing? Answer with exactly one lowercase English noun and nothing else. " +
  "If the canvas is empty, answer: nothing";

const client = new Anthropic();
const roundsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "rounds");
const dirs = process.argv.length > 2
  ? process.argv.slice(2)
  : fs.readdirSync(roundsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(roundsDir, d.name));

const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

async function guessFrame(file) {
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

// The "does the AI guess too early?" check. ponytail: exact match on word/synonyms only; the game does the fuzzy matching.
function report(dir, guesses, seconds) {
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8")); } catch {}
  const answers = [meta.word ?? path.basename(dir), ...(meta.synonyms ?? [])].map(norm);
  const ok = (g) => g && answers.includes(norm(g.guess));
  const first = guesses.find(ok);
  const twice = guesses.find((g, i) => i > 0 && ok(g) && ok(guesses[i - 1]) && guesses[i - 1].t === g.t - 1);
  const warn = first && first.t < seconds * 0.3 ? "  <-- TOO EARLY?" : "";
  console.log(`${path.basename(dir)}: ${seconds}s video, AI right at ${first ? first.t + "s" : "never"}, ` +
    `twice in a row at ${twice ? twice.t + "s" : "never"}${warn}`);
}

for (const dir of dirs) {
  const video = path.join(dir, "video.mp4");
  if (!fs.existsSync(video)) { console.warn(`skip ${dir}: no video.mp4`); continue; }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtd-"));
  // fps=1: frame k (0-based) is the canvas at second k. 512px is plenty for a sketch and keeps tokens low.
  execFileSync("ffmpeg", ["-loglevel", "error", "-i", video, "-vf", "fps=1,scale=512:-2", "-q:v", "4", path.join(tmp, "%04d.jpg")]);
  const frames = fs.readdirSync(tmp).sort();

  const guesses = [];
  for (let i = 0; i < frames.length; i += PARALLEL) {
    const batch = await Promise.all(frames.slice(i, i + PARALLEL).map((f) => guessFrame(path.join(tmp, f))));
    batch.forEach((guess, j) => guess ? guesses.push({ t: i + j, guess }) : console.warn(`  t=${i + j}: no guess, skipped`));
  }
  fs.rmSync(tmp, { recursive: true });

  fs.writeFileSync(path.join(dir, "guesses.json"), JSON.stringify(guesses, null, 2) + "\n");
  report(dir, guesses, frames.length);
}
