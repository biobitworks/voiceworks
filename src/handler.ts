import type { AppCtx, AppHandler } from "@sauna/apps-runtime";
import { Hono } from "hono";
import { buildFco, merkleRoot, leafHash } from "./lib/fco";
import { synthesize } from "./lib/eleven";

const app = new Hono<{ Bindings: { sql: any; websocket: any; ctx: AppCtx } }>();

// env.sql.raw returns rows as positional arrays, NOT keyed objects.
// We pass the SELECT column list and zip the row into a proper object.
function sqlAll(env: any, sql: string, columns: string[], params: any[] = []): any[] {
  const r = env.sql.raw(sql, params);
  const rows = (r && r.rows) || [];
  return rows.map((row: any[]) => {
    const o: any = {};
    for (let i = 0; i < columns.length; i++) o[columns[i]] = row[i];
    return o;
  });
}
function sqlRun(env: any, sql: string, params: any[] = []): void {
  env.sql.exec(sql, params);
}

// Genesis: Byron's actual FCO submission record, loaded as the genesis node.
const SEED_FCO_JSON = {
  "$schema": "https://cellico.bio/schemas/fco-record-v0.1.json",
  "fco_version": "0.1-draft",
  "object_type": "research_application_record",
  "object_id": "sha256:aacf06deadc9ee0ce1e06a56eeaa99d357cba922d9d4dd94510c4b113ebb9d96",
  "payload": {
    "path": "application_record.json",
    "media_type": "application/json",
    "sha256": "facb06127632f0430ff3ac7f2cd5b689d0d0a80ba5af6f0f257e185d63a01d54",
  },
  "authorization": {
    "author": "Byron P. Lee",
    "release_class": "public-safe",
    "excluded": ["credentials", "private biological data", "trade secrets", "operator-internal planning"],
  },
  "claim": {
    "type": "submission_record",
    "statement": "The author reports submission of the reconstructed research-credit application to Lambda at 09:58 PDT on 2026-07-15.",
    "claim_ceiling": "This record documents an author-attested submission and proposed research protocol; it does not establish award approval, completed GPU experiments, frontier-scale training, or validated novelty.",
  },
  "provenance": {
    "human_contribution": "Byron P. Lee: conceptualization, biological domain expertise, project direction, submission.",
    "ai_contribution": "Editorial synthesis, organization, machine-readable packaging.",
    "exact_form_export_available": false,
  },
  "private_payload_route": "public",
};

// Two voices in the registry. Each gets its own voice_model_spec FCO (idempotent
// on the spec's content-leaf); the spec is the per-person "private root" that
// gates access to that speaker's voice data in the FCG.
const VOICE_REGISTRY: Record<string, {
  voice_id: string;
  voice_name: string;
  model_id: string;
  voice_settings: { stability: number; similarity_boost: number; speed: number };
  role: "questioner" | "answerer";
}> = {
  "sauna-main": {
    voice_id: "ys3XeJJA4ArWMhRpcX1D",
    voice_name: "sauna-main",
    model_id: "eleven_flash_v2_5",
    voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 },
    role: "questioner",
  },
  "david": {
    voice_id: "jvcMcno3QtjOzGtfpjoI",
    voice_name: "david",
    model_id: "eleven_flash_v2_5",
    voice_settings: { stability: 0.55, similarity_boost: 0.8, speed: 0.95 },
    role: "answerer",
  },
};

function specFor(key: string) {
  const v = VOICE_REGISTRY[key];
  if (!v) throw new Error(`unknown voice "${key}"`);
  return {
    provider: "ElevenLabs",
    voice_id: v.voice_id,
    voice_name: v.voice_name,
    model_id: v.model_id,
    voice_settings: v.voice_settings,
    output_format: "mp3_44100_128",
    routed_via: "sauna.local/v1/elevenlabs",
    author: "Byron P. Lee",
    release_class: "public-safe",
    private_payload_route: "pointer-only", // §3 — voice spec is treated as a private pointer
  };
}

// Ensure the voice_model_spec FCO exists for a given voice key. Idempotent.
// object_id is deterministic (sha256 of canonical-JSON spec) so no caching needed.
async function ensureVoiceSpec(env: any, key: string): Promise<string> {
  const spec = specFor(key);
  const specBytes = new TextEncoder().encode(JSON.stringify(spec));
  const content_leaf = await leafHash(specBytes);
  const object_id = `sha256:${content_leaf}`;
  const existing = sqlAll(env, `SELECT object_id FROM fcos WHERE object_id = ? LIMIT 1`, ["object_id"], [object_id]);
  if (existing.length > 0) return object_id;
  sqlRun(env,
    `INSERT INTO fcos (object_id, object_type, content_leaf, op_leaf, parents_json, envelope_json, payload_preview, claim_ceiling, created_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [object_id, "voice_model_spec", content_leaf, content_leaf, "[]", JSON.stringify(spec),
     JSON.stringify(spec).slice(0, 200),
     `Voice model spec FCO for "${key}". Records ElevenLabs identity and settings; treated as private_payload_route=pointer-only. Not an endorsement, license, or warranty.`,
     new Date().toISOString()]
  );
  return object_id;
}

async function writeFco(env: any, opts: {
  object_type: string;
  payload_bytes: Uint8Array | string;
  payload_media_type: string;
  parents: string[];
  claim_ceiling: string;
}) {
  const { envelope, object_id, content_leaf, op_leaf } = await buildFco({
    object_type: opts.object_type,
    payload_bytes: opts.payload_bytes,
    payload_media_type: opts.payload_media_type,
    parents: opts.parents,
    authorization: { author: "Byron P. Lee", release_class: "public-safe" },
    claim: { type: opts.object_type, statement: `Agent action: ${opts.object_type}`, claim_ceiling: opts.claim_ceiling },
  });
  const preview = typeof opts.payload_bytes === "string"
    ? opts.payload_bytes.slice(0, 200)
    : new TextDecoder().decode(opts.payload_bytes.slice(0, 200));
  sqlRun(env,
    `INSERT INTO fcos (object_id, object_type, content_leaf, op_leaf, parents_json, envelope_json, payload_preview, claim_ceiling, created_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [object_id, opts.object_type, content_leaf, op_leaf, JSON.stringify(opts.parents), JSON.stringify(envelope), preview, opts.claim_ceiling, envelope.created_at_utc]
  );
  return { envelope, object_id, content_leaf, op_leaf };
}

function latestNodeId(env: any): string | null {
  const rows = sqlAll(env, `SELECT object_id FROM fcos ORDER BY id DESC LIMIT 1`, ["object_id"]);
  return rows.length > 0 ? rows[0].object_id : null;
}

app.get("/api/", (c) =>
  c.json({
    app: "voicing-fco",
    theme: "Four-tier voice custody: user vault · voice FCO · agent FCG · chain-of-custody graph.",
    description: "FCO/FCG custody graph where every agent action is a custody node. Each voice's outputs form their own sub-FCG, gated by a private Merkle root.",
    endpoints: ["/api/seed", "/api/voices", "/api/speak", "/api/converse", "/api/admit", "/api/graph", "/api/verify", "/api/audio/:object_id", "/api/fco/:object_id"],
    voices: Object.keys(VOICE_REGISTRY),
  })
);

app.post("/api/seed", async (c) => {
  const env = c.env as any;
  const existing = sqlAll(env, `SELECT id FROM fcos LIMIT 1`, ["id"]);
  if (existing.length > 0) return c.json({ ok: true, message: "graph already seeded", nodes: existing.length });
  const seedBytes = new TextEncoder().encode(JSON.stringify(SEED_FCO_JSON, null, 2));
  const content_leaf = await leafHash(seedBytes);
  const object_id = `sha256:${content_leaf}`;
  const now = new Date().toISOString();
  sqlRun(env,
    `INSERT INTO fcos (object_id, object_type, content_leaf, op_leaf, parents_json, envelope_json, payload_preview, claim_ceiling, created_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [object_id, "fco_submission_record", content_leaf, content_leaf, "[]", JSON.stringify(SEED_FCO_JSON),
     JSON.stringify(SEED_FCO_JSON).slice(0, 200), SEED_FCO_JSON.claim.claim_ceiling, now]
  );
  return c.json({ ok: true, message: "genesis node seeded", object_id });
});

app.post("/api/speak", async (c) => {
  const env = c.env as any;
  const body = await c.req.json<{ text: string; voice?: string; parent_id?: string }>();
  if (!body.text?.trim()) return c.json({ error: "empty text" }, 400);
  const voiceKey = body.voice ?? "sauna-main";
  const voiceSpecId = await ensureVoiceSpec(env, voiceKey);
  const parentId = body.parent_id ?? latestNodeId(env);
  const inputFco = await writeFco(env, {
    object_type: "tts_input_text",
    payload_bytes: body.text,
    payload_media_type: "text/plain",
    parents: Array.from(new Set([...(parentId ? [parentId] : []), voiceSpecId])),
    claim_ceiling: "This FCO records a text prompt submitted for synthesis. Provenance only.",
  });
  const spec = specFor(voiceKey);
  const tts = await synthesize(body.text, { voice_id: spec.voice_id, model_id: spec.model_id, voice_settings: spec.voice_settings });
  const outputFco = await writeFco(env, {
    object_type: "tts_output_audio",
    payload_bytes: tts.mp3,
    payload_media_type: "audio/mpeg",
    parents: [inputFco.object_id],
    claim_ceiling: "This FCO records an ElevenLabs TTS synthesis. Merkle root proves provenance, not correctness.",
  });
  const b64 = btoa(String.fromCharCode(...tts.mp3));
  sqlRun(env,
    `INSERT INTO audio_blobs (object_id, mp3_bytes_b64, voice_id, model_id, char_count) VALUES (?, ?, ?, ?, ?)`,
    [outputFco.object_id, b64, tts.voice_id, tts.model_id, tts.char_count]
  );
  return c.json({
    ok: true, voice: voiceKey,
    input_fco: inputFco.object_id, output_fco: outputFco.object_id,
    voice_id: tts.voice_id, model_id: tts.model_id, char_count: tts.char_count,
    audio_data_uri: `data:audio/mpeg;base64,${b64}`,
  });
});

// Converse: run a script of {role, text} turns. Each turn generates audio with
// the voice mapped to its role and emits per-turn FCOs chained to that voice's
// spec FCO and to the previous turn's output.
app.post("/api/converse", async (c) => {
  const env = c.env as any;
  const body = await c.req.json<{ script: { role: string; text: string }[] }>();
  if (!Array.isArray(body.script) || body.script.length === 0) {
    return c.json({ error: "script must be a non-empty array of {role, text}" }, 400);
  }
  const roleVoice: Record<string, string> = { questioner: "sauna-main", answerer: "david" };
  const turns: any[] = [];
  let prevFcoId: string | null = null;
  for (let i = 0; i < body.script.length; i++) {
    const turn = body.script[i];
    const text = (turn.text ?? "").trim();
    if (!text) { turns.push({ index: i, error: "empty text" }); continue; }
    const voiceKey = roleVoice[turn.role] ?? turn.role;
    let spec;
    try { spec = specFor(voiceKey); }
    catch { turns.push({ index: i, error: `unknown role/voice: ${turn.role}` }); continue; }
    const voiceSpecId = await ensureVoiceSpec(env, voiceKey);
    const inputFco = await writeFco(env, {
      object_type: `turn_${turn.role}_input`,
      payload_bytes: text,
      payload_media_type: "text/plain",
      parents: Array.from(new Set([...(prevFcoId ? [prevFcoId] : []), voiceSpecId])),
      claim_ceiling: "Conversation turn input text. Provenance only.",
    });
    const tts = await synthesize(text, { voice_id: spec.voice_id, model_id: spec.model_id, voice_settings: spec.voice_settings });
    const outputFco = await writeFco(env, {
      object_type: `turn_${turn.role}_audio`,
      payload_bytes: tts.mp3,
      payload_media_type: "audio/mpeg",
      parents: [inputFco.object_id],
      claim_ceiling: "Conversation turn audio. ElevenLabs synthesis; Merkle proves provenance, not semantics.",
    });
    const b64 = btoa(String.fromCharCode(...tts.mp3));
    sqlRun(env,
      `INSERT INTO audio_blobs (object_id, mp3_bytes_b64, voice_id, model_id, char_count) VALUES (?, ?, ?, ?, ?)`,
      [outputFco.object_id, b64, tts.voice_id, tts.model_id, tts.char_count]
    );
    turns.push({
      index: i, role: turn.role, voice: voiceKey,
      input_fco: inputFco.object_id, output_fco: outputFco.object_id,
      voice_id: tts.voice_id, model_id: tts.model_id, char_count: tts.char_count,
      audio_data_uri: `data:audio/mpeg;base64,${b64}`,
    });
    prevFcoId = outputFco.object_id;
  }
  return c.json({ ok: true, turns, count: turns.length });
});

app.get("/api/voices", (c) =>
  c.json({
    voices: Object.entries(VOICE_REGISTRY).map(([key, v]) => ({
      key, voice_id: v.voice_id, voice_name: v.voice_name, model_id: v.model_id, role: v.role,
    })),
  })
);

// Admission rule — the manuscript's novel contribution (§3, §4). An agent-asserted
// digest is admitted to the graph only when it is independently re-derivable from
// named bytes (preprint §3: "admission, not aggregation"). Every decision — admitted
// OR rejected — is itself an FCO in the chain, so the graph records who tried to
// assert what and how the vault responded. This is the on-screen moment that ties
// the four tiers together: the user's vault rejects a forged agent output.
app.post("/api/admit", async (c) => {
  const env = c.env as any;
  const body = await c.req.json<{ claimed_digest?: string; named_bytes?: string; object_id?: string }>();
  const claimed = (body.claimed_digest ?? "").replace(/^sha256:/, "").toLowerCase().trim();
  const named = body.named_bytes ?? "";
  if (!claimed || !named) return c.json({ error: "claimed_digest and named_bytes are required" }, 400);

  // Independently recompute the leaf hash from the named bytes (RFC 6962: 0x00 || data).
  const namedBytes = new TextEncoder().encode(named);
  const recomputed = await leafHash(namedBytes);

  const admitted = recomputed === claimed;
  const verdict = admitted ? "ADMITTED" : "REJECTED";
  const decisionJson = JSON.stringify({
    claimed_digest: claimed,
    recomputed_digest: recomputed,
    named_bytes_preview: named.slice(0, 80),
    admitted,
    decided_at: new Date().toISOString(),
  });
  const decision = await writeFco(env, {
    object_type: admitted ? "admission_decision_admitted" : "admission_decision_rejected",
    payload_bytes: decisionJson,
    payload_media_type: "application/json",
    parents: [latestNodeId(env)].filter(Boolean) as string[],
    claim_ceiling:
      "Admission rule per preprint §3: an agent-asserted digest is admitted only when independently re-derivable from the named bytes. " +
      "The custody leaf records whether the assertion recomputed; it does not certify the named bytes are true or that the producing agent is authentic.",
  });

  return c.json({
    ok: true,
    verdict,
    admitted,
    claimed_digest: claimed,
    recomputed_digest: recomputed,
    named_bytes_preview: named.slice(0, 80),
    node: decision.object_id,
    algorithm: "RFC 6962 leaf hash: sha256(0x00 ‖ utf8(named_bytes))",
    note: admitted
      ? "The agent's claimed digest recomputed to the same root — admitted to the graph."
      : "The agent's claimed digest did NOT recompute — REJECTED. The graph refused to admit the assertion.",
  });
});

// Single FCO fetch (full envelope) — useful for inspecting any node by id.
app.get("/api/fco/:object_id", async (c) => {
  const env = c.env as any;
  const objectId = c.req.param("object_id");
  const rows = sqlAll(env,
    `SELECT object_id, object_type, content_leaf, op_leaf, parents_json, envelope_json, claim_ceiling, created_at_utc FROM fcos WHERE object_id = ? LIMIT 1`,
    ["object_id", "object_type", "content_leaf", "op_leaf", "parents_json", "envelope_json", "claim_ceiling", "created_at_utc"],
    [objectId]
  );
  if (rows.length === 0) return c.json({ error: "not found" }, 404);
  const r = rows[0];
  return c.json({
    object_id: r.object_id,
    object_type: r.object_type,
    content_leaf: r.content_leaf,
    op_leaf: r.op_leaf,
    parents: JSON.parse(r.parents_json || "[]"),
    claim_ceiling: r.claim_ceiling,
    created_at_utc: r.created_at_utc,
    envelope: JSON.parse(r.envelope_json),
  });
});

app.get("/api/graph", async (c) => {
  const env = c.env as any;
  const rows = sqlAll(env,
    `SELECT object_id, object_type, content_leaf, op_leaf, parents_json, payload_preview, claim_ceiling, created_at_utc FROM fcos ORDER BY id ASC`,
    ["object_id", "object_type", "content_leaf", "op_leaf", "parents_json", "payload_preview", "claim_ceiling", "created_at_utc"]
  );
  return c.json({
    nodes: rows.map((r: any) => ({
      object_id: r.object_id, object_type: r.object_type,
      content_leaf: r.content_leaf, op_leaf: r.op_leaf,
      parents: JSON.parse(r.parents_json || "[]"),
      payload_preview: r.payload_preview,
      claim_ceiling: r.claim_ceiling,
      created_at_utc: r.created_at_utc,
    })),
    count: rows.length,
  });
});

app.get("/api/verify", async (c) => {
  const env = c.env as any;
  const rows = sqlAll(env, `SELECT content_leaf, parents_json FROM fcos ORDER BY id ASC`, ["content_leaf", "parents_json"]);
  if (rows.length === 0) return c.json({ ok: false, error: "empty graph" }, 400);
  const leaves = rows.map((r: any) => r.content_leaf);
  const computed_root = await merkleRoot(leaves);

  // Per-voice sub-roots: a node belongs to a voice's FCG if its parents include
  // that voice's voice_model_spec object_id. Each voice's vault root is the
  // Merkle root of its output leaves — that root is the "private Merkle root
  // key" that gates access to that speaker's voice data.
  const by_voice: Record<string, any> = {};
  for (const key of Object.keys(VOICE_REGISTRY)) {
    const spec = specFor(key);
    const specBytes = new TextEncoder().encode(JSON.stringify(spec));
    const specContentLeaf = await leafHash(specBytes);
    const specObjectId = `sha256:${specContentLeaf}`;
    const voiceLeaves: string[] = [];
    for (const r of rows) {
      if (r.content_leaf === specContentLeaf) continue;
      try {
        const parents = JSON.parse(r.parents_json || "[]");
        if (parents.includes(specObjectId)) voiceLeaves.push(r.content_leaf);
      } catch {}
    }
    by_voice[key] = {
      voice_name: VOICE_REGISTRY[key].voice_name,
      voice_id: VOICE_REGISTRY[key].voice_id,
      spec_object_id: specObjectId,
      leaf_count: voiceLeaves.length,
      merkle_root: voiceLeaves.length === 0 ? "(empty vault)" : await merkleRoot(voiceLeaves),
      leaves: voiceLeaves.slice(0, 5),
    };
  }

  return c.json({
    ok: true,
    leaf_count: rows.length,
    leaves: leaves.slice(0, 5),
    computed_root,
    by_voice,
    algorithm: "RFC 6962 (leaf 0x00, node 0x01, duplicate-last pairing)",
  });
});

app.get("/api/audio/:object_id", async (c) => {
  const env = c.env as any;
  const objectId = c.req.param("object_id");
  const rows = sqlAll(env, `SELECT mp3_bytes_b64 FROM audio_blobs WHERE object_id = ? LIMIT 1`, ["mp3_bytes_b64"], [objectId]);
  if (rows.length === 0) return c.json({ error: "not found" }, 404);
  const bytes = Uint8Array.from(atob(rows[0].mp3_bytes_b64), (ch: string) => ch.charCodeAt(0));
  return new Response(bytes, { headers: { "Content-Type": "audio/mpeg" } });
});

export default { fetch: (req: Request, env: any, ctx: AppCtx) => app.fetch(req, { ...env, ctx }) } satisfies AppHandler;
