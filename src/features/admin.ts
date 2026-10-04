import { Composer, InputFile } from "grammy";
import { toTelegramVoice } from "../audio.js";
import { config, isValidTime, isValidTimezone, type TtsProviderId } from "../config.js";
import type { BotContext } from "../context.js";
import { isLang, type Lang } from "../courses.js";
import * as store from "../store.js";
import { getTtsProvider, setTtsProvider, synthesize } from "../tts/index.js";
import { esc, spoiler } from "../ui.js";

/** Setup commands, hidden from the learner's menu. */
export const admin = new Composer<BotContext>();

const isOwner = (ctx: BotContext) => ctx.from?.id === config.ownerUserId;

const VOICE_TEST_TEXT: Record<Lang, string> = {
  ru: "Извините, вы не подскажете, как пройти к метро? Ой, ну ты даёшь! Я вообще не ожидал тебя здесь увидеть. Кстати, этот старинный замок закрыт на тяжёлый замок.",
  en: "Excuse me, do you know how to get to the subway? Oh, come on! I didn't expect to see you here at all. By the way, I read that book you lent me, and I'll read the next one soon.",
};

/** /voices [ru|en]: the same phrase in every configured TTS provider (Russian by default). */
admin.command("voices", async (ctx) => {
  if (!isOwner(ctx)) return;
  const arg = ctx.match.trim();
  const lang: Lang = isLang(arg) ? arg : "ru";
  const providers = [...config.availableTts].sort(() => Math.random() - 0.5);
  const labels = providers.map((_, i) => String.fromCharCode(65 + i));
  for (const [i, provider] of providers.entries()) {
    await ctx.replyWithChatAction("record_voice");
    const voice = await toTelegramVoice(await synthesize(VOICE_TEST_TEXT[lang], lang, provider));
    await ctx.replyWithVoice(new InputFile(voice, `voice-${labels[i]}.ogg`), { caption: `Voice ${labels[i]}` });
  }
  const mapping = providers.map((provider, i) => `${labels[i]} = ${provider}`).join(", ");
  await ctx.reply(`Which one sounds most natural? Who is who: ${spoiler(mapping)}\nSwitch with /voice ${config.availableTts.join(" | ")}`, {
    parse_mode: "HTML",
  });
});

admin.command("voice", async (ctx) => {
  if (!isOwner(ctx)) return;
  const requested = ctx.match.trim() as TtsProviderId;
  if (!config.availableTts.includes(requested)) {
    await ctx.reply(`Current voice: ${getTtsProvider()}. Available: ${config.availableTts.join(", ")}`);
    return;
  }
  setTtsProvider(requested);
  await ctx.reply(`Voice switched to ${requested}.`);
});

/** /course <userId> ru|en: fixes a learner's course if they picked the wrong one on /start. */
admin.command("course", async (ctx) => {
  if (!isOwner(ctx)) return;
  const [idArg, langArg] = ctx.match.trim().split(/\s+/).filter(Boolean);
  const learner = (await store.listLearners()).find((l) => l.id === Number(idArg));
  if (!learner || !isLang(langArg)) {
    await ctx.reply("Usage: /course <userId> ru|en (ru = learning Russian, en = learning English)");
    return;
  }
  await store.setLearning(learner.id, langArg);
  await ctx.reply(`${learner.firstName} now learns ${langArg === "ru" ? "Russian" : "English"}. Their tutor notes are kept as they were; /notes ${learner.id} to review them.`);
});

/**
 * /schedule                                  show all learners' schedules
 * /schedule <userId> 09:00,19:00 Europe/Berlin set times and timezone
 * /schedule <userId> off | on                 pause or resume reminders
 */
admin.command("schedule", async (ctx) => {
  if (!isOwner(ctx)) return;
  const learners = await store.listLearners();
  const [idArg, timesArg, tzArg] = ctx.match.trim().split(/\s+/).filter(Boolean);
  if (!idArg) {
    const lines = learners.map(
      (l) => `${l.id} ${esc(l.firstName)} [${l.learning ?? "no course"}]: ${l.lessonTimes.join(", ")} ${l.timezone}, reminders ${l.remindersEnabled ? "on" : "off"}`,
    );
    await ctx.reply(lines.join("\n") || "No learners yet.\n\nUsage: /schedule <userId> 09:00,19:00 Europe/Berlin");
    return;
  }
  const learner = learners.find((l) => l.id === Number(idArg));
  if (!learner) {
    await ctx.reply(`No learner with id ${idArg}. They need to open the bot first.`);
    return;
  }
  if (timesArg === "off" || timesArg === "on") {
    await store.saveSchedule(learner.id, learner.lessonTimes, learner.timezone, timesArg === "on");
    await ctx.reply(`Reminders ${timesArg} for ${learner.firstName}.`);
    return;
  }
  const times = (timesArg ?? "").split(",").filter(Boolean);
  const timezone = tzArg ?? learner.timezone;
  if (times.length === 0 || !times.every(isValidTime) || !isValidTimezone(timezone)) {
    await ctx.reply("Usage: /schedule <userId> 09:00,19:00 Europe/Berlin");
    return;
  }
  await store.saveSchedule(learner.id, times.sort(), timezone, true);
  await ctx.reply(`${learner.firstName}: reminders at ${times.join(", ")} (${timezone}).`);
});

admin.command("stats", async (ctx) => {
  if (!isOwner(ctx)) return;
  const usage = await store.usageByLearner();
  const lines = usage.map(
    (u) => `${u.learnerId} ${esc(u.firstName)}: ${u.sessions7d} sessions in 7 days, last active ${u.lastActivity ? u.lastActivity.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never"}`,
  );
  await ctx.reply(lines.join("\n") || "No learners yet.");
});

/** /notes [userId]: the tutor's private notes about a learner. */
admin.command("notes", async (ctx) => {
  if (!isOwner(ctx)) return;
  const id = Number(ctx.match.trim()) || ctx.from!.id;
  const learner = (await store.listLearners()).find((l) => l.id === id);
  await ctx.reply(learner?.tutorNotes ? `${learner.firstName}:\n\n${learner.tutorNotes}\n\nNext focus: ${learner.nextFocus}` : "No notes yet.");
});
