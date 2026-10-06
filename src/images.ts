import { config } from "./config.js";

/** Word pictures need an OpenAI key; without one the ladder works the same, just without them. */
export const imagesEnabled = (): boolean => config.openai !== undefined;

// The image guide says complex prompts can take up to 2 minutes.
const IMAGE_TIMEOUT_MS = 150_000;

const STYLE =
  "Style: bold flat illustration, strong shapes, one clear scene, expressive characters. No text, letters, numbers, captions or speech bubbles anywhere in the image.";

// https://developers.openai.com/api/docs/guides/image-generation
export async function generateImage(scene: string): Promise<Buffer> {
  const cfg = config.openai!;
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    // Low quality at the smallest recommended size: these are memory cues on a phone screen, not artwork.
    body: JSON.stringify({ model: cfg.imageModel, prompt: `${scene}\n\n${STYLE}`, size: "1024x1024", quality: "low", output_format: "jpeg" }),
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OpenAI image HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { data?: { b64_json?: string }[]; usage?: unknown };
  const image = body.data?.[0]?.b64_json;
  if (!image) throw new Error("OpenAI image response had no image data");
  if (body.usage) console.log(`[image] ${cfg.imageModel} usage ${JSON.stringify(body.usage)}`);
  return Buffer.from(image, "base64");
}
