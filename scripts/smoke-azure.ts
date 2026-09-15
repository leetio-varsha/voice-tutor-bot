// Checks Azure speech-to-text and pronunciation assessment without Telegram, using a Russian
// sample spoken by the macOS "Milena" voice. Prints Azure's raw JSON so the response shape
// can be confirmed on the first real run. Usage: npm run smoke:azure
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { toWav16k } from "../src/audio.js";
import { config } from "../src/config.js";
import { assessClarity, recognize } from "../src/speech/stt.js";

if (!config.azure) {
  console.error("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env");
  process.exit(1);
}

process.env.DEBUG_AZURE = "1";
const SPOKEN = "Здравствуйте! Мне, пожалуйста, большой капучино.";
// The target has extra words, so the scripted check should report omissions.
const TARGET = "Здравствуйте! Мне, пожалуйста, большой капучино без сахара.";

const dir = await mkdtemp(path.join(tmpdir(), "mathias-azure-"));
try {
  const aiff = path.join(dir, "sample.aiff");
  execFileSync("say", ["-v", "Milena", "-o", aiff, SPOKEN]);
  const wav = await toWav16k(await readFile(aiff));

  console.log("\n=== 1. Free speech: recognize, then assess clarity against the recognized text ===");
  const heard = await recognize(wav);
  console.log(JSON.stringify({ ...heard, clarity: await assessClarity(wav, heard.lexical ?? heard.text) }, null, 2));

  console.log("\n=== 2. Repeat-after-me: scripted assessment against a longer target ===");
  console.log(JSON.stringify(await recognize(wav, { referenceText: TARGET }), null, 2));
} finally {
  await rm(dir, { recursive: true, force: true });
}
