import { Composer, InlineKeyboard } from "grammy";
import { onButton, type BotContext } from "../context.js";
import * as store from "../store.js";
import type { Learner } from "../store.js";
import { localNow, shiftDate } from "../time.js";
import { menuLabels, type UiText } from "../i18n.js";
import { esc } from "../ui.js";

export const progress = new Composer<BotContext>();

/** Consecutive active days ending today, or yesterday if today has no practice yet. */
export function streakDays(activeDays: string[], today: string): number {
  const days = new Set(activeDays);
  let day = days.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = shiftDate(day, -1);
  }
  return streak;
}

export async function progressReport(learner: Learner, t: UiText, heading: string): Promise<string> {
  const today = localNow(learner.timezone).date;
  const stats = await store.progressStats(learner.id, learner.timezone, today);
  const streak = streakDays(stats.activeDays, today);
  const goal = learner.lessonTimes.length || 2;

  const { pronThisWeek, pronLastWeek } = stats;
  const pronunciation =
    pronThisWeek === null
      ? ""
      : t.averageScore(Math.round(pronThisWeek), pronLastWeek === null ? null : Math.round(pronLastWeek), pronLastWeek === null || pronThisWeek >= pronLastWeek);

  const lines = [
    `<b>${esc(heading)}</b>`,
    "",
    streak > 0 ? t.streak(streak) : t.noStreak,
    t.today(Math.min(stats.sessionsToday, goal), goal),
    "",
    `<b>${esc(t.last7Days)}</b>`,
    t.sessions(stats.sessions, stats.minutes),
    t.spokenReplies(stats.spokenReplies, stats.typedReplies),
    t.drills(stats.drills) + pronunciation,
    t.words(stats.wordsTotal, stats.wordsThisWeek),
  ];
  if (learner.nextFocus) lines.push("", `${esc(t.nextFocus)}: ${esc(learner.nextFocus)}`);
  return lines.join("\n");
}

export const practiceButtons = (t: UiText) => new InlineKeyboard().text(t.menu.talk, "menu:talk").text(t.pronunciationDrill, "repeat:next");

const showProgress = async (ctx: BotContext) => {
  await ctx.reply(await progressReport(ctx.learner, ctx.t, ctx.t.progressHeading), { parse_mode: "HTML", reply_markup: practiceButtons(ctx.t) });
};

progress.hears(menuLabels("progress"), showProgress);
onButton(progress, "menu:progress", showProgress);
