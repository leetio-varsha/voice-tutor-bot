import type { CallbackQueryContext, Composer, Context } from "grammy";
import type { Course } from "./courses.js";
import type { UiText } from "./i18n.js";
import type { Session } from "./session.js";
import type { Learner } from "./store.js";

/** Every handler after the learner middleware can rely on these. */
export type BotContext = Context & {
  learner: Learner;
  session: Session;
  /** The learner's course; handlers only run once they have picked one. */
  course: Course;
  /** Interface text in the learner's own language. */
  t: UiText;
};

/** Registers a button handler that stops the button's spinner first, so slow API calls don't look frozen. */
export function onButton(
  composer: Composer<BotContext>,
  data: string | RegExp,
  handler: (ctx: CallbackQueryContext<BotContext>) => Promise<unknown>,
): void {
  composer.callbackQuery(data, async (ctx) => {
    // Telegram rejects answers to presses older than ~15 s (e.g. queued during a deploy); the action should still run.
    await ctx.answerCallbackQuery().catch((err) => console.warn("answerCallbackQuery failed:", err instanceof Error ? err.message : err));
    await handler(ctx);
  });
}
