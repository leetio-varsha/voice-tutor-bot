// Checks Azure speech-to-text and pronunciation assessment without Telegram, using a sample spoken
// by a macOS voice. Prints Azure's raw JSON so the response shape can be confirmed on the first real
// run. Usage: npm run smoke:azure [ru|en] (Russian by default)
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { toWav16k } from "../src/audio.js";
import { config } from "../src/config.js";
import { isLang, type Lang } from "../src/courses.js";
import { assessClarity, recognize } from "../src/speech/stt.js";

if (!config.azure) {
  console.error("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env");
  process.exit(1);
}

process.env.DEBUG_AZURE = "1";
const lang: Lang = isLang(process.argv[2]) ? process.argv[2] : "ru";
// The target has extra words, so the scripted check should report omissions.
const SAMPLES: Record<Lang, { voice: string; spoken: string; target: string }> = {
  ru: {
    voice: "Milena",
    spoken: "Здравствуйте! Мне, пожалуйста, большой капучино.",
    target: "Здравствуйте! Мне, пожалуйста, большой капучино без сахара.",
  },
  en: { voice: "Samantha", spoken: "Hi! Can I get a large cappuccino, please?", target: "Hi! Can I get a large cappuccino with no sugar, please?" },
};
const { voice, spoken, target } = SAMPLES[lang];

const dir = await mkdtemp(path.join(tmpdir(), "mathias-azure-"));
try {
  const aiff = path.join(dir, "sample.aiff");
  execFileSync("say", ["-v", voice, "-o", aiff, spoken]);
  const wav = await toWav16k(await readFile(aiff));

  console.log("\n=== 1. Free speech: recognize, then assess clarity against the recognized text ===");
  const heard = await recognize(wav, { lang });
  console.log(JSON.stringify({ ...heard, clarity: await assessClarity(wav, heard.lexical ?? heard.text, lang) }, null, 2));

  console.log("\n=== 2. Repeat-after-me: scripted assessment against a longer target ===");
  console.log(JSON.stringify(await recognize(wav, { lang, referenceText: target }), null, 2));
} finally {
  await rm(dir, { recursive: true, force: true });
}
