# voiceworks

Voice data custody: every voice output is a hash-addressed Fractal Custody
Object inside a per-speaker Fractal Custody Graph, gated by a private Merkle
root. Built for the **ElevenLabs × Sauna Startup Hack Night** (Thursday,
July 16, 2026, Wordware office, San Francisco).

## 🧭 Navigation

| Want to... | Read |
|------------|------|
| **Use the demo** | Live app below — or see [`HOW_TO.md` § 1](HOW_TO.md#1-use--the-live-demo-flow) |
| **Verify the seal** | [`HOW_TO.md` § 2](HOW_TO.md#2-verify--reproducing-the-seal) |
| **Extend the code** | [`HOW_TO.md` § 3](HOW_TO.md#3-extend--adding-to-the-system) |
| **See all endpoints** | [`HOW_TO.md` § 4](HOW_TO.md#4-reference--endpoint-catalogue) |
| **See the security model** | [`SECURITY.md`](SECURITY.md) |
| **See the session seal** | [`SESSION_SEAL.json`](SESSION_SEAL.json) |
| **Re-derive the session seal** | `python3 tools/seal_conversation.py tools/turns.json` |

## Live demo

**https://voiceworks-ygitm4zl.sauna.new/**

A small **How to use** card is rendered at the top of every page in the live
app, so judges can navigate without leaving the demo.

## Demo video

[`demos/voiceworks_demo.mp4`](demos/voiceworks_demo.mp4) — MP4, 1366×768, 76s.
Also served directly: **https://voiceworks-ygitm4zl.sauna.new/demos/voiceworks_demo.mp4**

## Session seal

Every turn of the demo conversation (33 total: 18 human, 15 machine) is bound
into a Merkle chain in [`SESSION_SEAL.json`](SESSION_SEAL.json).

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

## Security model

See [`SECURITY.md`](SECURITY.md) for the full threat model, what Sauna
provides for free, and what voiceworks adds on top.

## Endpoints (live app)

| Method | Path | Purpose |
|--------|------|---------|
| POST   | `/api/seed`        | Load the genesis FCO submission record |
| POST   | `/api/speak`       | Wrap text as input FCO, call ElevenLabs, wrap audio as output FCO |
| POST   | `/api/converse`    | Run a script of role/voice turns |
| POST   | `/api/admit`       | Admission rule: re-derive agent digests from named bytes |
| POST   | `/api/view`        | Live seal: page-view event appended to graph on every refresh |
| GET    | `/api/voices`      | List available voices with role mapping |
| GET    | `/api/graph`       | List every node with parent links and claim ceilings |
| GET    | `/api/verify`      | Recompute the global Merkle root + per-voice sub-roots |
| GET    | `/api/live`        | Live snapshot: latest leaves + global root + server time |
| GET    | `/api/fco/:id`     | Fetch any single FCO envelope by id |
| GET    | `/api/audio/:id`   | Replay any synthesized audio |

## Chain of custody

```
genesis: fco_submission_record        ← the research protocol record
voice_model_spec (sauna-main)         ← ElevenLabs identity + settings
voice_model_spec (david)              ← second voice, per-speaker vault
tts_input_text ──► tts_output_audio   ← every /api/speak or /api/converse turn
                ↗
previous node + voice_model_spec (parent)
page_view_event (live seal)           ← appended on every page refresh
```

## Companion demo

[glasswork.butterbase.dev](https://glasswork.butterbase.dev) demonstrates the
same custody pattern applied to multi-model answer scoring.

## Tech stack

- **Backend**: Hono on Cloudflare Workers, raw SQLite via `env.sql`
- **Hashing**: SHA-256 via Web Crypto, RFC 6962 Merkle (duplicate-last pairing)
- **Voice**: ElevenLabs via the Sauna proxy (bundled quota, no API key)
- **Frontend**: React 18, single bundle
- **Sealing**: Python 3, RFC 6962 primitives, FCO envelope per preprint schema

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
