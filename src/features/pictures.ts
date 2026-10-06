import { Composer, InlineKeyboard, InputFile } from "grammy";
import { onButton, type BotContext } from "../context.js";
import { generateImage, imagesEnabled } from "../images.js";
import * as store from "../store.js";
import * as tutor from "../tutor.js";
import { esc } from "../ui.js";

/**
 * Pictures for ladder words. A word gets one when it is caught, shown together with the word; later the
 * picture alone is a recall task and a hint. The learner can replace it with a scene of their own.
 */
export const pictures = new Composer<BotContext>();

/** Every picture is a paid API call, so each learner gets a daily allowance. */
const PICTURES_PER_DAY = 8;
const OWN_SCENE_MAX_LENGTH = 400;

/**
 * Draws a picture for a word and sends it when it is ready. It runs after the reply is out, because an
 * image can take a minute; a failure only means the word stays without a picture.
 */
export function pictureInBackground(ctx: BotContext, wordId: number, ownScene?: string): void {
  if (!imagesEnabled() || !ctx.chat) return;
  const { learner, course, t } = ctx;
  const chatId = ctx.chat.id;
  void (async () => {
    try {
      const word = await store.findLadderWord(learner.id, wordId);
      if (!word) return;
      if (!(await store.claimPicture(learner.id, PICTURES_PER_DAY))) {
        if (ownScene) await ctx.api.sendMessage(chatId, t.pictureLimit);
        return;
      }
      const term = word[course.target];
      const meaning = word[course.native];
      const scene = ownScene ?? (await tutor.wordScene(course, term, meaning)).scene;
      const image = await generateImage(scene);
      const message = await ctx.api.sendPhoto(chatId, new InputFile(image, "word.jpg"), {
        caption: `💎 <b>${esc(term)}</b> · ${esc(meaning)}`,
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text(t.ownPicture, `pic:own:${word.id}`),
      });
      // Telegram keeps the file; its id is enough to show the picture again.
      const fileId = message.photo.at(-1)?.file_id;
      if (fileId) await store.saveWordPicture(learner.id, word.id, fileId, scene);
    } catch (err) {
      console.warn(`[image] word ${wordId} failed:`, err instanceof Error ? err.message : err);
      if (ownScene) await ctx.api.sendMessage(chatId, t.pictureFailed).catch(() => {});
    }
  })();
}

onButton(pictures, /^pic:own:(\d+)$/, async (ctx) => {
  ctx.session.awaiting = "picture";
  ctx.session.pictureFor = Number(ctx.match[1]);
  await ctx.reply(ctx.t.ownPicturePrompt);
});

/** Handles the typed or spoken answer to "My own picture". */
export async function startOwnPicture(ctx: BotContext, scene: string): Promise<void> {
  const wordId = ctx.session.pictureFor;
  ctx.session.awaiting = undefined;
  ctx.session.pictureFor = undefined;
  if (wordId === undefined) return;
  await ctx.reply(ctx.t.drawing);
  pictureInBackground(ctx, wordId, scene.slice(0, OWN_SCENE_MAX_LENGTH));
}
