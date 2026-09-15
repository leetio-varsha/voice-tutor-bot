import { Composer, InlineKeyboard } from "grammy";
import { onButton, type BotContext } from "../context.js";
import * as store from "../store.js";
import type { Learner } from "../store.js";
import { localNow, shiftDate } from "../time.js";
import { esc, MENU } from "../ui.js";

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

export async function progressReport(learner: Learner, heading: string): Promise<string> {
  const today = localNow(learner.timezone).date;
  const stats = await store.progressStats(learner.id, learner.timezone, today);
  const streak = streakDays(stats.activeDays, today);
  const goal = learner.lessonTimes.length || 2;

  let pronunciation = "";
  if (stats.pronThisWeek !== null) {
    const trend =
      stats.pronLastWeek === null ? "" : ` (${stats.pronThisWeek >= stats.pronLastWeek ? "↑" : "↓"} from ${Math.round(stats.pronLastWeek)})`;
    pronunciation = `, average score ${Math.round(stats.pronThisWeek)}${trend}`;
  }

  const lines = [
    `<b>${esc(heading)}</b>`,
    "",
    streak > 0 ? `🔥 Streak: ${streak} ${streak === 1 ? "day" : "days"}` : "🔥 Streak: start one today",
    `Today: ${Math.min(stats.sessionsToday, goal)} of ${goal} sessions`,
    "",
    "<b>Last 7 days</b>",
    `• Sessions: ${stats.sessions} (~${stats.minutes} min)`,
    `• Spoken replies: ${stats.spokenReplies}${stats.typedReplies ? `, typed: ${stats.typedReplies}` : ""}`,
    `• Drills: ${stats.drills}${pronunciation}`,
    `• Words: ${stats.wordsTotal} total, ${stats.wordsThisWeek} new`,
  ];
  if (learner.nextFocus) lines.push("", `🎯 Next focus: ${esc(learner.nextFocus)}`);
  return lines.join("\n");
}

export const practiceButtons = () => new InlineKeyboard().text("🗣 Talk", "menu:talk").text("🎧 Pronunciation drill", "repeat:next");

const showProgress = async (ctx: BotContext) => {
  await ctx.reply(await progressReport(ctx.learner, "📈 Your progress"), { parse_mode: "HTML", reply_markup: practiceButtons() });
};

progress.hears(MENU.progress, showProgress);
onButton(progress, "menu:progress", showProgress);
