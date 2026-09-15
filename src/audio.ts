import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

// ffmpeg-static is CommonJS (module.exports = path); its bundled .d.ts misleads NodeNext default imports.
const ffmpegStatic = createRequire(import.meta.url)("ffmpeg-static") as string | null;
const FFMPEG = process.env.FFMPEG_PATH ?? ffmpegStatic ?? "ffmpeg";

async function runFfmpeg(input: Buffer, outputName: string, args: string[]): Promise<Buffer> {
  // Temp files instead of pipes: WAV headers written to a pipe carry no length,
  // which some speech APIs reject.
  const dir = await mkdtemp(path.join(tmpdir(), "mathias-"));
  const inPath = path.join(dir, "input");
  const outPath = path.join(dir, outputName);
  try {
    await writeFile(inPath, input);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", inPath, ...args, outPath]);
      let stderr = "";
      proc.stderr.on("data", (chunk) => (stderr += chunk));
      proc.on("error", reject);
      proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`))));
    });
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Any input (Telegram OGG/Opus voice) -> 16 kHz mono 16-bit PCM WAV for speech recognition. */
export function toWav16k(input: Buffer): Promise<Buffer> {
  return runFfmpeg(input, "out.wav", ["-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"]);
}

/** Any TTS output -> OGG/Opus, the format Telegram renders as a voice message. `tempo` < 1 slows speech without changing pitch. */
export function toTelegramVoice(input: Buffer, tempo = 1): Promise<Buffer> {
  const filter = tempo === 1 ? [] : ["-filter:a", `atempo=${tempo}`];
  return runFfmpeg(input, "out.ogg", [...filter, "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "48k"]);
}

/** Duration of a 16 kHz mono 16-bit WAV produced by toWav16k (44-byte header). */
export function wavDurationSec(wav: Buffer): number {
  return Math.max(0, wav.length - 44) / (16000 * 2);
}
