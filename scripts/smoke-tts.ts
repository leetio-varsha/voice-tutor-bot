// Renders the blind-test phrase with every configured TTS provider into out/, so voices can be
// compared locally before touching Telegram. Usage: npm run smoke:tts
import { mkdir, writeFile } from "node:fs/promises";
import { toTelegramVoice } from "../src/audio.js";
import { config } from "../src/config.js";
import { synthesize } from "../src/tts/index.js";

const TEXT =
  "Извините, вы не подскажете, как пройти к метро? Ой, ну ты даёшь! Я вообще не ожидал тебя здесь увидеть. Кстати, этот старинный замок закрыт на тяжёлый замок.";

if (config.availableTts.length === 0) {
  console.error("No TTS provider configured in .env");
  process.exit(1);
}

await mkdir("out", { recursive: true });
for (const provider of config.availableTts) {
  const started = Date.now();
  try {
    const voice = await toTelegramVoice(await synthesize(TEXT, "ru", provider));
    await writeFile(`out/voice-${provider}.ogg`, voice);
    console.log(`${provider}: out/voice-${provider}.ogg (${Date.now() - started} ms)`);
  } catch (err) {
    console.error(`${provider}: ${err instanceof Error ? err.message : err}`);
  }
}
