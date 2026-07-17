# voicing-fco

A Sauna App that demonstrates **four-tier voice custody** for AI agents, anchored
in the FCO/FCG (Fractal Custody Object / Fractal Custody Graph) design from
Byron P. Lee's preprint
[*Fractal Custody Objects and Graphs for Efficient, Verifiable AI Training and
Computational Biology*](https://doi.org/10.5281/zenodo.21210575) (submitted to
Lambda 2026-07-15, 09:58 PDT).

> **Every piece of data is secure and private when interacting with AI.**
> Tokenization of voice files where the user keeps the Merkle root in a private
> vault, AI agents get their own Merkle tree, and a chain-of-custody graph
> allows users to maintain privacy while companies like Sauna and ElevenLabs
> continue building.

## Four-tier architecture

| Tier | What | How voicing-fco implements it |
|---|---|---|
| **1 — User vault** | User holds the private Merkle root key | Genesis FCO + voice_model_spec FCOs carry `private_payload_route: "pointer-only"`. Only the content_leaf is public; the spec bytes are gated. |
| **2 — Voice FCO** | Each voice output tokenized as a content-addressed FCO | Every TTS call mints an input FCO + output FCO with `bytes_sha256` + `media_type: audio/mpeg` in the canonical envelope. |
| **3 — Agent FCG** | Each AI agent keeps its own Merkle tree | Two voices registered (`sauna-main` = Sauna's narrator, `david` = ElevenLabs' answerer). Each voice's outputs form a sub-FCG rooted at its `voice_model_spec` object_id. The per-voice Merkle root IS the private Merkle root key. |
| **4 — Chain of custody** | Tamper-evident graph linking every FCO through RFC 6962 | Full graph Merkle root, recomputed in the browser from the shipped leaves and verified against the server root. Tampering one byte breaks the root. |

Plus the **admission rule** (preprint §3, the manuscript's novel contribution):
an agent-asserted digest is admitted to the graph only if it is independently
re-derivable from the named bytes. Every decision — admitted OR rejected —
is itself an FCO in the chain. This is the on-screen moment where the user's
vault rejects a forged agent output.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/` | App info, endpoint list |
| POST | `/api/seed` | Mint the genesis FCO from Byron's preprint submission record |
| GET | `/api/voices` | List registered voice agents |
| POST | `/api/speak` | Speak text via a registered voice; wraps input + output as FCOs |
| POST | `/api/converse` | Run a script of `{role, text}` turns; each turn gets its own FCO pair |
| POST | `/api/admit` | Admission rule: agent-asserted digest admitted only if it recomputes from named bytes |
| GET | `/api/graph` | List all FCOs in chronological order |
| GET | `/api/verify` | Recompute Merkle root + per-agent vault roots |
| GET | `/api/fco/:object_id` | Fetch a single FCO by id with full envelope |
| GET | `/api/audio/:object_id` | Fetch the synthesized audio for an output FCO |

## Hashing

RFC 6962 with domain separation:
- Leaf: `sha256(0x00 || utf8_bytes)`
- Node: `sha256(0x01 || left || right)`
- Duplicate-last pairing for odd leaf counts (the §3 fix for CVE-2012-2459)

The Merkle root of all `content_leaves` in chronological order is the full
chain root. The Merkle root of each agent's output leaves (those whose
`parents` include that agent's voice spec) is the agent's vault root — the
**private Merkle root key** that gates that agent's voice data.

## Voice data flow

```
user ─► /api/speak ─► voice_model_spec FCO (Tier 1)
                  ─► tts_input_text FCO (Tier 2)
                  ─► ElevenLabs ─► tts_output_audio FCO (Tier 2)
                                      audio_blobs (keyed by object_id)

user ─► /api/admit { claimed_digest, named_bytes }
      ─► recompute leafHash(named_bytes) via Web Crypto
      ─► if matches claimed: admission_decision_admitted FCO (Tier 1)
      ─► if mismatched:     admission_decision_rejected FCO (Tier 1)

each FCO carries:
  object_id  = "sha256:" + content_leaf  (content-addressed graph id)
  parents    = [previous_node, voice_spec_id]
  claim_ceiling = explicit ceiling on what this FCO proves
  private_payload_route = "pointer-only" for voice specs
```

## Run locally / deploy

This is a [Sauna App](https://docs.sauna.ai/apps): it runs on the Sauna platform,
uses an app-owned SQLite database, and surfaces at a public URL.

```sh
# From a Sauna session with the `apps` skill loaded:
app_deploy { slug: "voicing-fco" }
# Returns a URL like https://voicing-fco-<id>.sauna.new/
```

No accounts or connections needed — ElevenLabs is the bundled `sauna.local/v1`
proxy, metered to Sauna credits.

## File layout

```
voicing-fco/
├── app.md            # Sauna manifest + README
├── package.json      # hono + drizzle-orm + react
├── public/
│   ├── index.html    # React shell
│   ├── favicon.png
│   └── llms.txt      # agent-discoverable endpoint summary
├── src/
│   ├── handler.ts    # Hono backend (/api/* endpoints)
│   ├── client.tsx    # React UI (four-tier view + admission rule demo)
│   ├── schema.ts     # Drizzle schema (fcos + audio_blobs tables)
│   ├── db.ts         # sqlite-proxy adapter
│   └── lib/
│       ├── fco.ts    # RFC 6962 primitives, FCO envelope builder
│       └── eleven.ts # ElevenLabs TTS via sauna.local/v1
└── migrations/
    ├── 0000_init.sql # DDL for fcos + audio_blobs
    ├── migrations.js # drizzle migration bundle
    └── meta/         # migration snapshot + journal
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).

## Citation

> Lee, B. P. (2026). *Fractal Custody Objects and Graphs for Efficient, Verifiable
> AI Training and Computational Biology* (preprint v1). Zenodo.
> https://doi.org/10.5281/zenodo.21210575
