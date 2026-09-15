import { wavDurationSec } from "../audio.js";
import { config } from "../config.js";
import type { PronunciationResult, Recognition } from "./types.js";

// Azure short-audio REST limits: 60 s for recognition, 30 s with pronunciation assessment.
// https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-speech-to-text-short
const AZURE_MAX_SEC = 60;
const AZURE_ASSESS_MAX_SEC = 30;

export interface RecognizeOptions {
  /** Known target text (listen-and-repeat): one scripted assessment call. */
  referenceText?: string;
}

export async function recognize(wav: Buffer, options: RecognizeOptions = {}): Promise<Recognition> {
  if (config.azure) return recognizeAzure(wav, options);
  if (config.openai) return { text: await transcribeOpenAI(wav) };
  throw new Error("No speech-to-text provider configured");
}

/**
 * Free speech: assess the audio against what recognition heard. This measures how clearly each
 * word was said, not whether it was the right word (a wrong word said clearly still scores high).
 * Returns undefined when Azure isn't configured or the clip is too long to assess.
 */
export async function assessClarity(wav: Buffer, recognizedLexical: string): Promise<PronunciationResult | undefined> {
  if (!config.azure || !recognizedLexical || wavDurationSec(wav) > AZURE_ASSESS_MAX_SEC) return undefined;
  const data = await azureRequest(wav, assessmentParams(recognizedLexical, false));
  return parsePronunciation(data.NBest?.[0]);
}

// --- Azure ---

interface AzureWord {
  Word: string;
  AccuracyScore?: number;
  ErrorType?: string;
  PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string };
}

interface AzureScores {
  AccuracyScore?: number;
  FluencyScore?: number;
  CompletenessScore?: number;
  PronScore?: number;
}

interface AzureNBest extends AzureScores {
  Lexical?: string;
  Display?: string;
  Words?: AzureWord[];
  PronunciationAssessment?: AzureScores;
}

interface AzureResponse {
  RecognitionStatus: string;
  DisplayText?: string;
  NBest?: AzureNBest[];
}

async function azureRequest(wav: Buffer, pronunciationParams?: Record<string, string>): Promise<AzureResponse> {
  const azure = config.azure!;
  const url = `https://${azure.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=ru-RU&format=detailed`;
  const headers: Record<string, string> = {
    "Ocp-Apim-Subscription-Key": azure.key,
    "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
    Accept: "application/json",
  };
  if (pronunciationParams) {
    headers["Pronunciation-Assessment"] = Buffer.from(JSON.stringify(pronunciationParams), "utf8").toString("base64");
  }
  const send = () => fetch(url, { method: "POST", headers, body: new Uint8Array(wav) });
  let res = await send();
  if (res.status >= 500) {
    // Azure occasionally returns a bare 500 that succeeds on an identical retry; retry once, never more.
    await new Promise((resolve) => setTimeout(resolve, 500));
    res = await send();
  }
  if (!res.ok) throw new Error(`Azure STT HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as AzureResponse;
  if (process.env.DEBUG_AZURE) console.log("Azure raw response:", JSON.stringify(data, null, 2));
  if (data.RecognitionStatus === "Error") throw new Error("Azure STT returned RecognitionStatus=Error");
  return data;
}

// The REST reference shows scores flat on the NBest item; the pronunciation how-to shows them
// nested under PronunciationAssessment. Accept both.
function parsePronunciation(best: AzureNBest | undefined): PronunciationResult | undefined {
  if (!best) return undefined;
  const scores = best.PronunciationAssessment ?? best;
  if (typeof scores.AccuracyScore !== "number") return undefined;
  return {
    pronScore: scores.PronScore ?? scores.AccuracyScore,
    accuracy: scores.AccuracyScore,
    fluency: scores.FluencyScore ?? 0,
    completeness: scores.CompletenessScore,
    words: (best.Words ?? []).map((word) => {
      const ws = word.PronunciationAssessment ?? word;
      return { word: word.Word, accuracy: ws.AccuracyScore ?? 0, errorType: ws.ErrorType ?? "None" };
    }),
  };
}

function assessmentParams(referenceText: string, enableMiscue: boolean): Record<string, string> {
  return {
    ReferenceText: referenceText,
    GradingSystem: "HundredMark",
    Granularity: "Word",
    Dimension: "Comprehensive",
    EnableMiscue: enableMiscue ? "True" : "False",
  };
}

async function recognizeAzure(wav: Buffer, options: RecognizeOptions): Promise<Recognition> {
  const duration = wavDurationSec(wav);
  if (duration > AZURE_MAX_SEC) {
    throw new Error(`That voice message is ${Math.round(duration)} s; please keep it under ${AZURE_MAX_SEC} s`);
  }
  if (options.referenceText && duration <= AZURE_ASSESS_MAX_SEC) {
    // Scripted: miscue detection marks skipped and extra words against the target.
    const data = await azureRequest(wav, assessmentParams(options.referenceText, true));
    const best = data.NBest?.[0];
    return { text: best?.Display ?? data.DisplayText ?? "", lexical: best?.Lexical, pronunciation: parsePronunciation(best) };
  }

  const data = await azureRequest(wav);
  const best = data.NBest?.[0];
  return { text: best?.Display ?? data.DisplayText ?? "", lexical: best?.Lexical };
}

// --- OpenAI (fallback: transcript only, no pronunciation scores) ---

async function transcribeOpenAI(wav: Buffer): Promise<string> {
  const openai = config.openai!;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "speech.wav");
  form.append("model", openai.sttModel);
  form.append("language", "ru");
  form.append("response_format", "json");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openai.apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI STT HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { text?: string };
  return data.text?.trim() ?? "";
}
