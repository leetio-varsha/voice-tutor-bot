import { config, type TtsProviderId } from "../config.js";
import { COURSES, type Lang } from "../courses.js";

let current: TtsProviderId | undefined = config.ttsProvider;

export function getTtsProvider(): TtsProviderId | undefined {
  return current;
}

/** Global switch (POC has a single learner), used by /voice after the blind test. */
export function setTtsProvider(provider: TtsProviderId): void {
  current = provider;
}

/** Returns raw provider audio (MP3 or OGG) in the given language; callers transcode for Telegram. */
export function synthesize(text: string, lang: Lang, provider: TtsProviderId | undefined = current): Promise<Buffer> {
  switch (provider) {
    case "elevenlabs":
      return elevenlabs(text, lang);
    case "azure":
      return azure(text, lang);
    case "openai":
      return openai(text, lang);
    default:
      throw new Error("No TTS provider configured");
  }
}

async function audioOrThrow(res: Response, label: string): Promise<Buffer> {
  if (!res.ok) throw new Error(`${label} TTS HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

// https://elevenlabs.io/docs/api-reference/text-to-speech/convert
async function elevenlabs(text: string, lang: Lang): Promise<Buffer> {
  const cfg = config.elevenlabs!;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cfg.voiceIds[lang]}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": cfg.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: cfg.modelId }),
  });
  return audioOrThrow(res, "ElevenLabs");
}

const xmlEscape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech
async function azure(text: string, lang: Lang): Promise<Buffer> {
  const cfg = config.azure!;
  const voice = cfg.ttsVoices[lang];
  // MAI-Voice-2 voices support expressive styles; classic neural ru-RU voices have none.
  const body = voice.includes(":MAI-Voice")
    ? `<mstts:express-as style="friendly">${xmlEscape(text)}</mstts:express-as>`
    : xmlEscape(text);
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${COURSES[lang].locale}"><voice name="${xmlEscape(voice)}">${body}</voice></speak>`;
  const res = await fetch(`https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": cfg.key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "mathias-speech",
    },
    body: ssml,
  });
  return audioOrThrow(res, "Azure");
}

// https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create
const OPENAI_INSTRUCTIONS: Record<Lang, string> = {
  ru: "Speak natural, conversational Russian like a friendly native speaker: clear articulation, relaxed moderate pace, lively everyday intonation.",
  en: "Speak natural, conversational American English like a friendly native speaker: clear articulation, relaxed moderate pace, lively everyday intonation.",
};

async function openai(text: string, lang: Lang): Promise<Buffer> {
  const cfg = config.openai!;
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.ttsModel,
      voice: cfg.ttsVoice,
      input: text,
      instructions: OPENAI_INSTRUCTIONS[lang],
      response_format: "mp3",
    }),
  });
  return audioOrThrow(res, "OpenAI");
}
