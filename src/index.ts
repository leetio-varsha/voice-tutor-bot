import { GrammyError } from "grammy";
import { createBot, whenIdle } from "./bot.js";
import { assertBotConfig, config } from "./config.js";
import { migrate, pool } from "./db.js";
import { startScheduler } from "./scheduler.js";
import { getTtsProvider } from "./tts/index.js";

const { telegramToken } = assertBotConfig();
await migrate();

const bot = createBot(telegramToken);

await bot.api.setMyCommands([{ command: "menu", description: "Show the main menu" }]);
// Telegram shows this one to users whose app language is Russian.
await bot.api.setMyCommands([{ command: "menu", description: "Главное меню" }], { language_code: "ru" });

const scheduler = startScheduler(bot.api);
const SHUTDOWN_GRACE_MS = 20_000;

async function shutdown() {
  clearInterval(scheduler);
  await bot.stop();
  // Updates are handled in the background, so let replies that are on their way go out first.
  await whenIdle(SHUTDOWN_GRACE_MS);
  await pool.end();
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

// Long polling: no public URL needed. During a deploy the previous instance may still be polling,
// and Telegram answers 409 Conflict; wait for it to stop instead of crashing.
const MAX_CONFLICT_RETRIES = 24;
for (let attempt = 1; ; attempt++) {
  try {
    await bot.start({
      onStart: (me) =>
        console.log(
          `@${me.username} is running. TTS: ${getTtsProvider()}, STT: ${config.azure ? "azure + pronunciation" : "openai"}, model: ${config.claudeModel}, allowed users: ${config.allowedUserIds.join(", ") || "none"}`,
        ),
    });
    break;
  } catch (err) {
    if (err instanceof GrammyError && err.error_code === 409 && attempt <= MAX_CONFLICT_RETRIES) {
      console.warn(`Another instance is still polling Telegram; retrying in 5 s (${attempt}/${MAX_CONFLICT_RETRIES})`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    throw err;
  }
}
