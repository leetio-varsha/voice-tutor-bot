import "dotenv/config";

export type TtsProviderId = "elevenlabs" | "azure" | "openai";

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function required(name: string): string {
  const value = optional(name);
  if (!value) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return value;
}

const allowedUserIds = (optional("ALLOWED_USER_IDS") ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean)
  .map(Number);

const azure =
  optional("AZURE_SPEECH_KEY") || optional("AZURE_SPEECH_REGION")
    ? {
        key: required("AZURE_SPEECH_KEY"),
        region: required("AZURE_SPEECH_REGION"),
        ttsVoice: optional("AZURE_TTS_VOICE") ?? "ru-RU-SvetlanaNeural",
      }
    : undefined;

const elevenlabs = optional("ELEVENLABS_API_KEY")
  ? {
      apiKey: required("ELEVENLABS_API_KEY"),
      voiceId: required("ELEVENLABS_VOICE_ID"),
      modelId: optional("ELEVENLABS_MODEL_ID") ?? "eleven_v3",
    }
  : undefined;

const openai = optional("OPENAI_API_KEY")
  ? {
      apiKey: required("OPENAI_API_KEY"),
      ttsModel: optional("OPENAI_TTS_MODEL") ?? "gpt-4o-mini-tts",
      ttsVoice: optional("OPENAI_TTS_VOICE") ?? "marin",
      sttModel: optional("OPENAI_STT_MODEL") ?? "gpt-4o-transcribe",
    }
  : undefined;

const availableTts: TtsProviderId[] = [
  ...(elevenlabs ? (["elevenlabs"] as const) : []),
  ...(azure ? (["azure"] as const) : []),
  ...(openai ? (["openai"] as const) : []),
];

const requestedTts = optional("TTS_PROVIDER") as TtsProviderId | undefined;
if (requestedTts && !availableTts.includes(requestedTts)) {
  throw new Error(`TTS_PROVIDER=${requestedTts} but that provider's API key is not configured`);
}

export const config = {
  telegramToken: optional("TELEGRAM_BOT_TOKEN"),
  databaseUrl: optional("DATABASE_URL"),
  allowedUserIds,
  /** Receives /stats and other setup commands; defaults to the first allowed user. */
  ownerUserId: optional("OWNER_USER_ID") ? Number(optional("OWNER_USER_ID")) : allowedUserIds[0],
  /** Defaults for new learners; change per learner with the owner-only /schedule command. */
  defaultTimezone: optional("DEFAULT_TIMEZONE") ?? "Europe/Kyiv",
  defaultLessonTimes: (optional("DEFAULT_LESSON_TIMES") ?? "09:00,19:00")
    .split(",")
    .map((time) => time.trim())
    .filter(Boolean),
  claudeModel: optional("CLAUDE_MODEL") ?? "claude-opus-5",
  azure,
  elevenlabs,
  openai,
  availableTts,
  ttsProvider: requestedTts ?? availableTts[0],
};

/** Checks everything the bot needs; scripts that only use one provider skip this. */
export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export const isValidTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

export function assertBotConfig(): { telegramToken: string } {
  if (!config.telegramToken) throw new Error("Missing TELEGRAM_BOT_TOKEN (see .env.example)");
  if (!config.databaseUrl) throw new Error("Missing DATABASE_URL (see .env.example)");
  if (!isValidTimezone(config.defaultTimezone)) throw new Error(`DEFAULT_TIMEZONE is not a valid IANA timezone: ${config.defaultTimezone}`);
  if (!config.defaultLessonTimes.every(isValidTime)) throw new Error("DEFAULT_LESSON_TIMES must look like 09:00,19:00");
  if (config.availableTts.length === 0) {
    throw new Error("Configure at least one TTS provider: ELEVENLABS_*, AZURE_SPEECH_* or OPENAI_API_KEY");
  }
  if (!config.azure && !config.openai) {
    throw new Error("Configure speech-to-text: AZURE_SPEECH_* (recommended, adds pronunciation scores) or OPENAI_API_KEY");
  }
  if (config.allowedUserIds.length === 0) {
    console.warn("ALLOWED_USER_IDS is empty: every user will be blocked and told their id.");
  }
  return { telegramToken: config.telegramToken };
}
