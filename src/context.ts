import type { CallbackQueryContext, Composer, Context } from "grammy";
import type { Session } from "./session.js";
import type { Learner } from "./store.js";

/** Every handler after the learner middleware can rely on these. */
export type BotContext = Context & {
  learner: Learner;
  session: Session;
};

/** Registers a button handler that stops the button's spinner first, so slow API calls don't look frozen. */
export function onButton(
  composer: Composer<BotContext>,
  data: string | RegExp,
  handler: (ctx: CallbackQueryContext<BotContext>) => Promise<unknown>,
): void {
  composer.callbackQuery(data, async (ctx) => {
    await ctx.answerCallbackQuery();
    await handler(ctx);
  });
}
