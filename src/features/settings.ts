import { Composer, InlineKeyboard } from "grammy";
import { isValidTimezone } from "../config.js";
import { onButton, type BotContext } from "../context.js";
import * as store from "../store.js";
import type { Learner } from "../store.js";
import { localNow } from "../time.js";
import * as tutor from "../tutor.js";
import { esc, MENU } from "../ui.js";

/** Reminder times and timezone, all through buttons; the settings message is edited in place. */
export const settings = new Composer<BotContext>();

const MAX_LESSON_TIMES = 4;
const HOURS = Array.from({ length: 18 }, (_, i) => String(i + 6).padStart(2, "0")); // 06..23
const MINUTES = ["00", "15", "30", "45"];
const COMMON_TIMEZONES = [
  ["Kyiv", "Europe/Kyiv"],
  ["Warsaw", "Europe/Warsaw"],
  ["Berlin", "Europe/Berlin"],
  ["London", "Europe/London"],
  ["Lisbon", "Europe/Lisbon"],
  ["Istanbul", "Europe/Istanbul"],
  ["Dubai", "Asia/Dubai"],
  ["Bangkok", "Asia/Bangkok"],
  ["New York", "America/New_York"],
  ["Los Angeles", "America/Los_Angeles"],
] as const;

function settingsView(learner: Learner) {
  const now = localNow(learner.timezone);
  const clock = `${String(Math.floor(now.minutes / 60)).padStart(2, "0")}:${String(now.minutes % 60).padStart(2, "0")}`;
  const text = [
    "<b>⚙️ Settings</b>",
    "",
    `⏰ Reminders: ${learner.remindersEnabled ? "on" : "off"}`,
    `Times: ${learner.lessonTimes.join(", ") || "none"}`,
    `🌍 Timezone: ${esc(learner.timezone)} (now ${clock})`,
  ].join("\n");

  const keyboard = new InlineKeyboard().text(learner.remindersEnabled ? "⏰ Reminders: ON" : "⏰ Reminders: OFF", "set:toggle");
  if (learner.remindersEnabled) keyboard.success();
  keyboard.row();
  for (const time of learner.lessonTimes) keyboard.text(`✖ ${time}`, `set:del:${time}`);
  if (learner.lessonTimes.length < MAX_LESSON_TIMES) keyboard.text("➕ Add time", "set:add");
  keyboard.row().text("🌍 Change timezone", "set:tz");
  return { text, keyboard };
}

async function save(ctx: BotContext, changes: Partial<Pick<Learner, "lessonTimes" | "timezone" | "remindersEnabled">>) {
  Object.assign(ctx.learner, changes);
  const { learner } = ctx;
  await store.saveSchedule(learner.id, [...learner.lessonTimes].sort(), learner.timezone, learner.remindersEnabled);
  learner.lessonTimes.sort();
}

async function redraw(ctx: BotContext) {
  const view = settingsView(ctx.learner);
  await ctx.editMessageText(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
}

settings.hears(MENU.settings, async (ctx) => {
  const view = settingsView(ctx.learner);
  await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
});

onButton(settings, "set:toggle", async (ctx) => {
  await save(ctx, { remindersEnabled: !ctx.learner.remindersEnabled });
  await redraw(ctx);
});

onButton(settings, /^set:del:(\d\d:\d\d)$/, async (ctx) => {
  await save(ctx, { lessonTimes: ctx.learner.lessonTimes.filter((time) => time !== ctx.match[1]) });
  await redraw(ctx);
});

onButton(settings, "set:add", async (ctx) => {
  const keyboard = new InlineKeyboard();
  HOURS.forEach((hour, i) => {
    keyboard.text(hour, `set:hour:${hour}`);
    if ((i + 1) % 6 === 0) keyboard.row();
  });
  keyboard.row().text("← Back", "set:back");
  await ctx.editMessageText("<b>⏰ Add a reminder</b>\n\nPick the hour:", { parse_mode: "HTML", reply_markup: keyboard });
});

onButton(settings, /^set:hour:(\d\d)$/, async (ctx) => {
  const hour = ctx.match[1];
  const keyboard = new InlineKeyboard();
  for (const minute of MINUTES) keyboard.text(`${hour}:${minute}`, `set:time:${hour}:${minute}`);
  keyboard.row().text("← Back", "set:add");
  await ctx.editMessageText(`<b>⏰ Add a reminder</b>\n\nPick the time:`, { parse_mode: "HTML", reply_markup: keyboard });
});

onButton(settings, /^set:time:(\d\d:\d\d)$/, async (ctx) => {
  const time = ctx.match[1]!;
  if (!ctx.learner.lessonTimes.includes(time) && ctx.learner.lessonTimes.length < MAX_LESSON_TIMES) {
    await save(ctx, { lessonTimes: [...ctx.learner.lessonTimes, time], remindersEnabled: true });
  }
  await redraw(ctx);
});

onButton(settings, "set:tz", async (ctx) => {
  const keyboard = new InlineKeyboard();
  COMMON_TIMEZONES.forEach(([label, zone], i) => {
    keyboard.text(label, `set:tz:${zone}`);
    if (i % 2 === 1) keyboard.row();
  });
  keyboard.row().text("🏙 Type my city", "set:city").row().text("← Back", "set:back");
  await ctx.editMessageText("<b>🌍 Timezone</b>\n\nPick the closest city, or type yours:", { parse_mode: "HTML", reply_markup: keyboard });
});

onButton(settings, /^set:tz:(.+)$/, async (ctx) => {
  const zone = ctx.match[1]!;
  if (isValidTimezone(zone)) await save(ctx, { timezone: zone });
  await redraw(ctx);
});

onButton(settings, "set:city", async (ctx) => {
  ctx.session.awaiting = "city";
  await ctx.reply("Type your city (for example: Vienna, Tbilisi, Buenos Aires).");
});

onButton(settings, "set:back", redraw);

/** Handles the typed answer to "Type my city". */
export async function saveCityTimezone(ctx: BotContext, place: string): Promise<void> {
  ctx.session.awaiting = undefined;
  const { timezone } = await tutor.cityTimezone(place);
  if (!timezone || !isValidTimezone(timezone)) {
    await ctx.reply("I couldn't find a timezone for that place. Open ⚙️ Settings and pick one from the list.");
    return;
  }
  await save(ctx, { timezone });
  const view = settingsView(ctx.learner);
  await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
}
