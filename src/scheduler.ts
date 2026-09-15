import { InlineKeyboard, type Api } from "grammy";
import { streakDays, progressReport, practiceButtons } from "./features/progress.js";
import { closeIdleLessons } from "./lessons.js";
import * as store from "./store.js";
import type { Learner } from "./store.js";
import { isoWeekKey, localNow, timeToMinutes } from "./time.js";
import { TOPICS } from "./ui.js";

const TICK_MS = 60_000;
/** A reminder goes out within this many minutes after its slot; later (e.g. after downtime) it's skipped. */
const REMINDER_WINDOW_MIN = 60;
/** No reminder if the learner practiced this recently. */
const RECENT_PRACTICE_MIN = 180;
const WEEKLY_SUMMARY = { weekday: "Sun", fromMinutes: 20 * 60, toMinutes: 22 * 60 };

async function sendReminders(api: Api, learner: Learner): Promise<void> {
  const now = localNow(learner.timezone);
  for (const slot of learner.lessonTimes) {
    const slotMinutes = timeToMinutes(slot);
    if (now.minutes < slotMinutes || now.minutes >= slotMinutes + REMINDER_WINDOW_MIN) continue;
    // Claim first: exactly one instance handles a slot, even during a deploy overlap.
    if (!(await store.claimNotification(learner.id, "reminder", `${now.date}T${slot}`))) continue;

    const idle = await store.minutesSinceActivity(learner.id);
    if (idle !== undefined && idle < RECENT_PRACTICE_MIN) {
      console.log(`[scheduler] skipped ${slot} reminder for ${learner.id}: practiced ${Math.round(idle)} min ago`);
      continue;
    }

    const stats = await store.progressStats(learner.id, learner.timezone, now.date);
    const streak = streakDays(stats.activeDays, now.date);
    const topics = TOPICS.filter((t) => t.scenario);
    const topic = topics[Math.floor(Math.random() * topics.length)]!;
    const text = [
      `⏰ Time for 15 minutes of Russian${learner.firstName ? `, ${learner.firstName}` : ""}.`,
      streak > 0 ? `🔥 ${streak}-day streak, keep it going!` : "",
      `How about this one: ${topic.label}`,
    ]
      .filter(Boolean)
      .join("\n");
    const keyboard = new InlineKeyboard()
      .text(`Start: ${topic.label}`, `topic:${topic.id}`)
      .primary()
      .row()
      .text("Other topic", "menu:talk")
      .text("🎧 Quick drill", "repeat:next");
    await api.sendMessage(learner.id, text, { reply_markup: keyboard });
    console.log(`[scheduler] sent ${slot} reminder to ${learner.id}`);
  }
}

async function sendWeeklySummary(api: Api, learner: Learner): Promise<void> {
  const now = localNow(learner.timezone);
  if (now.weekday !== WEEKLY_SUMMARY.weekday || now.minutes < WEEKLY_SUMMARY.fromMinutes || now.minutes >= WEEKLY_SUMMARY.toMinutes) return;
  if ((await store.minutesSinceActivity(learner.id)) === undefined) return; // never practiced: nothing to summarize
  if (!(await store.claimNotification(learner.id, "weekly", isoWeekKey(now.date)))) return;
  await api.sendMessage(learner.id, await progressReport(learner, "🗓 Your week in Russian"), {
    parse_mode: "HTML",
    reply_markup: practiceButtons(),
  });
  console.log(`[scheduler] sent weekly summary to ${learner.id}`);
}

let running = false;

async function tick(api: Api): Promise<void> {
  if (running) return;
  running = true;
  try {
    await closeIdleLessons();
    for (const learner of await store.listLearners()) {
      try {
        if (learner.remindersEnabled) await sendReminders(api, learner);
        await sendWeeklySummary(api, learner);
      } catch (err) {
        // e.g. the learner blocked the bot; keep going for everyone else.
        console.error(`[scheduler] learner ${learner.id}:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error("[scheduler] tick failed:", err instanceof Error ? err.message : err);
  } finally {
    running = false;
  }
}

export function startScheduler(api: Api): NodeJS.Timeout {
  void tick(api);
  return setInterval(() => void tick(api), TICK_MS);
}
