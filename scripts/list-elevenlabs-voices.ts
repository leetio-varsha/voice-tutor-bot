// Lists ElevenLabs voices available to the account, to pick ELEVENLABS_VOICE_ID.
// Usage: npm run voices:elevenlabs [-- search-term]
// GET /v2/voices, see https://api.elevenlabs.io/openapi.json
import "dotenv/config";

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("Set ELEVENLABS_API_KEY in .env");
  process.exit(1);
}

interface Voice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
}

const params = new URLSearchParams({ page_size: "100" });
const search = process.argv[2];
if (search) params.set("search", search);

let nextPageToken: string | undefined;
do {
  if (nextPageToken) params.set("next_page_token", nextPageToken);
  const res = await fetch(`https://api.elevenlabs.io/v2/voices?${params}`, { headers: { "xi-api-key": apiKey } });
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const data = (await res.json()) as { voices: Voice[]; has_more?: boolean; next_page_token?: string | null };
  for (const voice of data.voices) {
    const labels = Object.entries(voice.labels ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join(", ");
    console.log(`${voice.voice_id}  ${voice.name}  [${voice.category ?? "?"}]  ${labels}`);
  }
  nextPageToken = data.has_more ? (data.next_page_token ?? undefined) : undefined;
} while (nextPageToken);
