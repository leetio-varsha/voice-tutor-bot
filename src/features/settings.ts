import { Composer, InlineKeyboard } from "grammy";
import { isValidTimezone } from "../config.js";
import { onButton, type BotContext } from "../context.js";
import * as store from "../store.js";
import type { Learner } from "../store.js";
import { localNow } from "../time.js";
import * as tutor from "../tutor.js";
import { menuLabels, type UiText } from "../i18n.js";
import { esc } from "../ui.js";

/** Reminder times and timezone, all through buttons; the settings message is edited in place. */
export const settings = new Composer<BotContext>();

const MAX_LESSON_TIMES = 4;
const HOURS = Array.from({ length: 18 }, (_, i) => String(i + 6).padStart(2, "0")); // 06..23
const MINUTES = ["00", "15", "30", "45"];
/** City labels come from UiText.cities, keyed by these zones. */
const COMMON_TIMEZONES = [
  "Europe/Kyiv",
  "Europe/Warsaw",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Istanbul",
  "Asia/Dubai",
  "Asia/Bangkok",
  "America/New_York",
  "America/Los_Angeles",
] as const;

function settingsView(learner: Learner, t: UiText) {
  const now = localNow(learner.timezone);
  const clock = `${String(Math.floor(now.minutes / 60)).padStart(2, "0")}:${String(now.minutes % 60).padStart(2, "0")}`;
  const text = [
    `<b>${esc(t.settings)}</b>`,
    "",
    esc(t.reminders(learner.remindersEnabled)),
    esc(t.times(learner.lessonTimes.join(", ") || t.noTimes)),
    esc(t.timezone(learner.timezone, clock)),
  ].join("\n");

  const keyboard = new InlineKeyboard().text(learner.remindersEnabled ? t.remindersOn : t.remindersOff, "set:toggle");
  if (learner.remindersEnabled) keyboard.success();
  keyboard.row();
  for (const time of learner.lessonTimes) keyboard.text(`✖ ${time}`, `set:del:${time}`);
  if (learner.lessonTimes.length < MAX_LESSON_TIMES) keyboard.text(t.addTime, "set:add");
  keyboard.row().text(t.changeTimezone, "set:tz");
  return { text, keyboard };
}

async function save(ctx: BotContext, changes: Partial<Pick<Learner, "lessonTimes" | "timezone" | "remindersEnabled">>) {
  Object.assign(ctx.learner, changes);
  const { learner } = ctx;
  await store.saveSchedule(learner.id, [...learner.lessonTimes].sort(), learner.timezone, learner.remindersEnabled);
  learner.lessonTimes.sort();
}

async function redraw(ctx: BotContext) {
  const view = settingsView(ctx.learner, ctx.t);
  await ctx.editMessageText(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
}

settings.hears(menuLabels("settings"), async (ctx) => {
  const view = settingsView(ctx.learner, ctx.t);
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
  keyboard.row().text(ctx.t.back, "set:back");
  await ctx.editMessageText(`<b>${esc(ctx.t.addReminder)}</b>\n\n${esc(ctx.t.pickHour)}`, { parse_mode: "HTML", reply_markup: keyboard });
});

onButton(settings, /^set:hour:(\d\d)$/, async (ctx) => {
  const hour = ctx.match[1];
  const keyboard = new InlineKeyboard();
  for (const minute of MINUTES) keyboard.text(`${hour}:${minute}`, `set:time:${hour}:${minute}`);
  keyboard.row().text(ctx.t.back, "set:add");
  await ctx.editMessageText(`<b>${esc(ctx.t.addReminder)}</b>\n\n${esc(ctx.t.pickTime)}`, { parse_mode: "HTML", reply_markup: keyboard });
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
  COMMON_TIMEZONES.forEach((zone, i) => {
    keyboard.text(ctx.t.cities[zone] ?? zone, `set:tz:${zone}`);
    if (i % 2 === 1) keyboard.row();
  });
  keyboard.row().text(ctx.t.typeMyCity, "set:city").row().text(ctx.t.back, "set:back");
  await ctx.editMessageText(`<b>${esc(ctx.t.timezoneTitle)}</b>\n\n${esc(ctx.t.pickCity)}`, { parse_mode: "HTML", reply_markup: keyboard });
});

onButton(settings, /^set:tz:(.+)$/, async (ctx) => {
  const zone = ctx.match[1]!;
  if (isValidTimezone(zone)) await save(ctx, { timezone: zone });
  await redraw(ctx);
});

onButton(settings, "set:city", async (ctx) => {
  ctx.session.awaiting = "city";
  await ctx.reply(ctx.t.typeCityPrompt);
});

onButton(settings, "set:back", redraw);

/** Handles the typed answer to "Type my city". */
export async function saveCityTimezone(ctx: BotContext, place: string): Promise<void> {
  ctx.session.awaiting = undefined;
  const { timezone } = await tutor.cityTimezone(ctx.course, place);
  if (!timezone || !isValidTimezone(timezone)) {
    await ctx.reply(ctx.t.cityNotFound);
    return;
  }
  await save(ctx, { timezone });
  const view = settingsView(ctx.learner, ctx.t);
  await ctx.reply(view.text, { parse_mode: "HTML", reply_markup: view.keyboard });
}
