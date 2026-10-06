// Draws one word picture into out/, to check the OpenAI key, the model name and the cost before the
// bot starts sending pictures. Usage: npm run smoke:image
import { mkdir, writeFile } from "node:fs/promises";
import { config } from "../src/config.js";
import { COURSES } from "../src/courses.js";
import { generateImage, imagesEnabled } from "../src/images.js";
import { wordScene } from "../src/tutor.js";

if (!imagesEnabled()) {
  console.error("OPENAI_API_KEY is not set in .env");
  process.exit(1);
}

const { scene } = await wordScene(COURSES.en, "cut corners", "срезать углы, халтурить");
console.log(`scene: ${scene}`);
const started = Date.now();
const image = await generateImage(scene);
await mkdir("out", { recursive: true });
await writeFile("out/word-picture.jpg", image);
console.log(`${config.openai!.imageModel}: out/word-picture.jpg (${Math.round(image.length / 1024)} KB, ${Date.now() - started} ms)`);
