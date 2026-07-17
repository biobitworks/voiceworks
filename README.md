# voiceworks

Voice data custody: every voice output is a hash-addressed Fractal Custody
Object inside a per-speaker Fractal Custody Graph, gated by a private Merkle
root. Built for the **ElevenLabs × Sauna Startup Hack Night** (Thursday,
July 16, 2026, Wordware office, San Francisco).

## Live demo

**https://voiceworks-ygitm4zl.sauna.new/**

## Demo video (perma link)

[`demos/voiceworks_demo.mp4`](demos/voiceworks_demo.mp4) — MP4, 1366×768, 76s.
Also served directly from the app: **https://voiceworks-ygitm4zl.sauna.new/demos/voiceworks_demo.mp4**

## Session seal

Every turn of the demo conversation (33 total: 18 human, 15 machine) is bound
into a Merkle chain in [`SESSION_SEAL.json`](SESSION_SEAL.json). Each leaf
carries `provenance: human|machine` and the `voice_tokenizer` that would
render it as speech, so when voice data is tokenized the seal preserves
which tokens came from a human turn vs. a machine turn.

| Field | Value |
|-------|-------|
| conversation_id | `ses_0925e44ecffeEAPq9bq5IJX3sZ` |
| turn_count | 33 |
| human turns | 18 |
| machine turns | 15 |
| voice tokenizer | ElevenLabs `sauna-main` (`ys3XeJJA4ArWMhRpcX1D`), model `eleven_multilingual_v2` |
| merkle_algorithm | RFC 6962 (leaf 0x00, node 0x01, duplicate-last pairing) |
| **merkle_root** | `39ff5fcacb2be4759c3bb8629e11e07c7de9ef52a4f142a7b5f52866f2ba9250` |
| **object_id** | `sha256:f7065468eb5976de25c5b7b987295c3e3bf6192758968de7a65dffc1111c0333` |

Re-derive it: `python3 tools/seal_conversation.py tools/turns.json`

## Security model

See [`SECURITY.md`](SECURITY.md) for how this is built into Sauna's
secure-AI architecture — including where errors/failures surface, the
admission rule, per-voice vault keys, and what we deliberately don't do.

**Where errors/failures surface in the custody graph:**
- **Admission rejection** → `admission_decision_rejected` FCO pointing to
  the inputs that failed. Look for object_type starting with `admission_decision_`.
- **Voice call failure** → ElevenLabs throws inside `writeFco()`; the
  partial FCO is rolled back because we don't `sqlRun` until after `synthesize()`.
- **Voice substitution** → mismatch between audio blob's `voice_id` and the
  envelope's voice spec; the graph refuses to admit it as the same FCO.
- **Browser/server root mismatch** → `/api/verify` returns `ok: false` with
  `computed_root` differing from the on-screen value. Tamper detection.

**How to determine human vs AI in any node:**
1. Read the leaf's `provenance` field directly (set by `seal_conversation.py`).
2. Cross-reference the turn index with `SESSION_SEAL.json`.
3. Verify the leaf hash recomputes from `(index, provenance, content_hash, voice_id)`.

## Endpoints (live app)

| Method | Path | Purpose |
|--------|------|---------|
| POST   | `/api/seed`        | Load Byron's actual FCO submission record as the genesis node |
| POST   | `/api/speak`       | Wrap text as input FCO, call ElevenLabs, wrap audio as output FCO |
| POST   | `/api/converse`    | Run a script of role/voice turns (sauna-main = questioner, david = answerer) |
| POST   | `/api/admit`       | Admission rule per preprint §3: agent-asserted digest admitted only when re-derivable from named bytes |
| GET    | `/api/voices`      | List available voices with role mapping |
| GET    | `/api/graph`       | List every node with parent links and claim ceilings |
| GET    | `/api/verify`      | Recompute the global Merkle root + per-voice sub-roots |
| GET    | `/api/fco/:id`     | Fetch any single FCO envelope by id |
| GET    | `/api/audio/:id`   | Replay any synthesized audio |

## Chain of custody

```
genesis: fco_submission_record        ← Byron's actual Lambda application packet
voice_model_spec (sauna-main)         ← ElevenLabs identity + settings, locked
voice_model_spec (david)              ← second voice, per-speaker vault
tts_input_text ──► tts_output_audio   ← every /api/speak or /api/converse turn
                ↗
previous node + voice_model_spec (parent)
```

## Tech stack

- **Backend**: Hono on Cloudflare Workers, raw SQLite via `env.sql`
- **Hashing**: SHA-256 via Web Crypto, RFC 6962 Merkle (duplicate-last pairing)
- **Voice**: ElevenLabs via the Sauna proxy (bundled quota, no API key)
- **Frontend**: React 18, single bundle, no external icon library

## Tools

- `tools/seal_conversation.py` — turns JSON → session seal JSON
- `tools/build_seal.py` — files → release seal JSON

## License

Apache License 2.0 — see `LICENSE`.

## Provenance & authorship

- **Author**: Byron P. Lee — `biobitworks` / `Cellico.bio` / `Yunes Foundation for Research on Aging`
- **Preprint**: *Fractal Custody Objects and Graphs for Efficient, Verifiable AI Training and Computational Biology* — Zenodo DOI `10.5281/zenodo.21210575`
- **Deploying agent**: Sauna
- **Voice provider**: ElevenLabs (bundled quota via Sauna proxy)
