# HOW TO use, verify, and extend voiceworks

This guide is for judges, reviewers, and the next developer picking up the
code. Three parts: **Use**, **Verify**, **Extend**.

---

## 1. USE — the live demo flow

Open **https://voiceworks-ygitm4zl.sauna.new/** in a browser. The page loads
and immediately:

1. **Seals itself.** The page calls `POST /api/view` on mount, which appends
   a `page_view_event` FCO to the graph and recomputes the global Merkle root.
   You'll see the **Live Merkle root** in the top-right panel change.
2. **Polls `/api/live` every few seconds** so the seal updates as new
   actions happen elsewhere.
3. Shows the **custody graph** (every FCO + parent links + claim ceiling),
   the **per-voice vaults** (sauna-main, david, …), and the **running seal**.

### Demo paths (pick one)

#### A. Single-voice quick tour (1 minute)

- Click **Seed genesis** — loads the FCO submission record as the genesis node (idempotent).
- Click **Speak** with the default text — wraps input as `tts_input_text`, calls ElevenLabs via the Sauna proxy, wraps the audio as `tts_output_audio`. Two new nodes appear in the graph, the root recomputes, and the audio plays back.
- Watch the **Live Merkle root** panel — the hex string changes after every action.

#### B. Two-voice demo script (90 seconds)

- Click **Run demo script** — runs 12 turns (Q + A) where `sauna-main` plays the questioner and `david` plays the answerer. Each turn becomes two FCOs (input text + audio output), each chained to the voice's `voice_model_spec` and to the previous turn's output.
- Watch the **per-voice vault** section in the live panel: the `sauna-main` vault root grows; the `david` vault root grows separately. Two private Merkle roots, two custody chains.

#### C. Admission rule (30 seconds)

- Click **Try a forged digest** — the demo button pre-fills `claimed_digest` with a random hash and `named_bytes` with sample text. The app recomputes `SHA-256(0x00 ‖ named_bytes)` and **rejects** the forgery because the digests don't match.
- Then click **Try the honest digest** — recomputes the correct leaf hash for the same text and **admits** it.
- Both verdicts become FCOs in the graph (`admission_decision_rejected` / `admission_decision_admitted`) — visible forever in the custody chain.

---

## 2. VERIFY — reproducing the seal

### Verify the live Merkle root

The `/api/verify` endpoint recomputes the root from the leaves server-side
and returns it alongside per-voice sub-roots. Compare what it says with what
the UI shows.

```bash
curl -s https://voiceworks-ygitm4zl.sauna.new/api/verify | jq
```

Returns `{ leaf_count, leaves, computed_root, by_voice, algorithm }`.

### Verify the session seal

The session seal is a self-contained FCO envelope in `SESSION_SEAL.json`
in this repo. Re-derive it locally:

```bash
python3 tools/seal_conversation.py tools/turns.json
```

It writes `turns.seal.json` next to `turns.json`. Compare `merkle_root` and
`object_id` with the values in `SESSION_SEAL.json`. They must match
exactly. Any change to any turn (content, role, provenance, voice
tokenizer) recomputes a different root.

### Verify any single FCO

`GET /api/fco/:object_id` returns the full envelope for any node. The
content-leaf hash is `SHA-256(0x00 ‖ canonical_json(envelope))`; recompute
locally and compare.

### Verify tamper detection

Edit any byte in any `audio_blobs` row in the app's SQLite. The global
Merkle root in `/api/verify` will not match what the browser shows. The
UI's "Merkle root matches server" indicator flips to red.

---

## 3. EXTEND — adding to the system

### Add a new voice

1. Add an entry to `VOICE_REGISTRY` in `src/lib/eleven.ts`:
   ```ts
   export const VOICE_REGISTRY = {
     "sauna-main":  { voice_id: "...", voice_name: "...", model_id: "...", role: "questioner", ... },
     "david":       { voice_id: "...", voice_name: "...", model_id: "...", role: "answerer",   ... },
     "<your-voice>": { voice_id: "...", voice_name: "...", model_id: "...", role: "<role>",     ... },
   };
   ```
2. Redeploy. The first TTS call that uses the new voice lazily creates a
   `voice_model_spec` FCO. From then on it's a parent of every node in that
   voice's sub-graph.

### Add a new endpoint

All endpoints live in `src/handler.ts`. Use the existing endpoints as a
template — `ensureVoiceSpec(env, voiceKey)` gives you the voice spec FCO,
`writeFco(env, {...})` inserts a new FCO, `sqlAll` / `sqlRun` read / write.

### Add a new tool / agent

Wrap the call as an FCO. Two-line pattern:

```ts
await writeFco(env, {
  object_type: "<your_agent_action>",
  payload_bytes: <bytes>,
  payload_media_type: "application/json",
  parents: [latestNodeId(env), voiceSpecId],
  claim_ceiling: "<what this record proves, narrowly>",
});
```

The graph automatically grows; the Merkle root recomputes; the action is
forever auditable.

### Re-seal the session

Edit `tools/turns.json`, then re-run:

```bash
python3 tools/seal_conversation.py tools/turns.json
mv turns.seal.json ../../SESSION_SEAL.json
git add SESSION_SEAL.json && git commit -m "Reseal" && git push
```

---

## 4. REFERENCE — endpoint catalogue

| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST   | `/api/seed`       | — | `{ ok, message, object_id }` |
| POST   | `/api/speak`      | `{ text, voice? }` | `{ ok, input_fco, output_fco, audio_data_uri, ... }` |
| POST   | `/api/converse`   | `{ script: [{role, text}] }` | `{ ok, turns: [...] }` |
| POST   | `/api/admit`      | `{ claimed_digest, named_bytes }` | `{ verdict, admitted, recomputed_digest, node }` |
| POST   | `/api/view`       | `{ nonce?, route? }` | `{ leaf_added, leaf_count, merkle_root, nonce }` |
| GET    | `/api/voices`     | — | `{ voices: [...] }` |
| GET    | `/api/graph`      | — | `{ nodes: [...], count }` |
| GET    | `/api/verify`     | — | `{ leaf_count, leaves, computed_root, by_voice }` |
| GET    | `/api/live`       | — | `{ leaf_count, merkle_root, last_12_leaves, server_time_utc }` |
| GET    | `/api/fco/:id`    | — | `{ object_id, envelope, ... }` |
| GET    | `/api/audio/:id`  | — | `audio/mpeg` bytes |

---

## 5. TRUST — what this does and does not prove

| Proves | Does not prove |
|--------|---------------|
| Provenance of bytes shipped in the graph | Correctness of the agent's reasoning |
| Order of turns and leaf insertions | Authenticity of the speaker's identity |
| That the voice model spec bound to a node is the one that produced the audio | That the speaker consented to the synthesis |
| Per-voice vault contents (Merkle root = cryptographic key for that vault) | That any claim in the conversation is true |
| Re-derivation of claimed digests from named bytes | That the produced speech matches the speaker's intent |
| Tamper-evidence — change any byte, the root changes | That the system is fit for any specific purpose |

For the full security model, see [`SECURITY.md`](SECURITY.md).

---

*Built for the ElevenLabs × Sauna Startup Hack Night, July 16, 2026. Author:
Byron P. Lee. Deploying agent: Sauna.*
