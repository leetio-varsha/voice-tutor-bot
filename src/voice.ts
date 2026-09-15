import { InputFile, type InlineKeyboard } from "grammy";
import { toTelegramVoice } from "./audio.js";
import type { BotContext } from "./context.js";
import type { Session } from "./session.js";
import { synthesize } from "./tts/index.js";
import { clip, stripStress } from "./ui.js";

export const SLOWER_TEMPO = 0.8;

/** Synthesizes Russian speech and keeps the raw audio for the "Slower" button. Returns a Telegram voice file. */
export async function renderVoice(session: Session, textRu: string): Promise<Buffer> {
  const raw = await synthesize(stripStress(textRu));
  session.lastAudio = raw;
  return toTelegramVoice(raw);
}

export function sendVoice(ctx: BotContext, voice: Buffer, captionHtml: string, keyboard?: InlineKeyboard) {
  return ctx.replyWithVoice(new InputFile(voice, "tutor.ogg"), {
    caption: clip(captionHtml),
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

export async function speak(ctx: BotContext, textRu: string, captionHtml: string, keyboard: InlineKeyboard) {
  await ctx.replyWithChatAction("record_voice");
  await sendVoice(ctx, await renderVoice(ctx.session, textRu), captionHtml, keyboard);
}

/**
 * Telegram shows a chat action for about 5 seconds; a voice turn takes longer, so repeat it
 * until the work finishes. Otherwise the chat looks idle while the bot is still working.
 */
export async function withChatAction<T>(ctx: BotContext, action: "typing" | "record_voice", work: () => Promise<T>): Promise<T> {
  const ping = () => ctx.replyWithChatAction(action).catch(() => {});
  void ping();
  const timer = setInterval(ping, 4000);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}

export async function downloadVoice(ctx: BotContext, telegramToken: string): Promise<Buffer> {
  const file = await ctx.getFile();
  if (!file.file_path) throw new Error("Telegram did not return a file path for this voice message");
  // The URL embeds the bot token: never log it.
  const res = await fetch(`https://api.telegram.org/file/bot${telegramToken}/${file.file_path}`);
  if (!res.ok) throw new Error(`Voice download failed with HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
