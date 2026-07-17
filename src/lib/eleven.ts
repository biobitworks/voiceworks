// ElevenLabs TTS via the Sauna proxy. Bundled quota — no auth needed.
// Default voice is sauna-main (ys3XeJJA4ArWMhRpcX1D); callers may pass any other
// premade/library voice_id (e.g. "david" = jvcMcno3QtjOzGtfpjoI) to give each
// agent in the FCG a distinct speaker.

const DEFAULT_VOICE_ID = "ys3XeJJA4ArWMhRpcX1D"; // sauna-main
const DEFAULT_MODEL_ID = "eleven_flash_v2_5";

export interface TtsOptions {
  voice_id?: string;
  model_id?: string;
  voice_settings?: { stability: number; similarity_boost: number; speed: number };
}

export interface TtsResult {
  mp3: Uint8Array;
  voice_id: string;
  model_id: string;
  char_count: number;
}

export async function synthesize(text: string, opts: TtsOptions = {}): Promise<TtsResult> {
  const voiceId = opts.voice_id ?? DEFAULT_VOICE_ID;
  const modelId = opts.model_id ?? DEFAULT_MODEL_ID;
  const voiceSettings = opts.voice_settings ?? { stability: 0.5, similarity_boost: 0.75, speed: 1.0 };

  // Strip markdown crud that breaks ElevenLabs (per skill gotchas).
  const cleaned = text
    .replace(/[*_`#>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n+/g, " ")
    .trim();

  const res = await fetch(
    `https://sauna.local/v1/elevenlabs/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: cleaned,
        model_id: modelId,
        voice_settings: voiceSettings,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${err}`);
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  return {
    mp3: buf,
    voice_id: voiceId,
    model_id: modelId,
    char_count: cleaned.length,
  };
}
