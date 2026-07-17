# voiceworks

FCO/FCG custody graph where every voice output is a hash-addressed node inside a
per-speaker Fractal Custody Graph, gated by a private Merkle root.

Built for the **ElevenLabs × Sauna Startup Hack Night** (Thursday, July 16, 2026,
Wordware office, 1185B Old Mason Street, San Francisco).

## What this is

Every text-to-speech call, every voice model, and every byte of synthesized audio
is bound to a Fractal Custody Object (FCO) per the architecture proposed in
Byron P. Lee's preprint *Fractal Custody Objects and Graphs for Efficient,
Verifiable AI Training and Computational Biology* (Zenodo DOI
`10.5281/zenodo.21210575`). All FCOs are chained into a Fractal Custody Graph
(FCG) using RFC 6962 domain-separated Merkle hashing (leaf `0x00`, node `0x01`,
duplicate-last pairing).

**The graph is the memory. The graph has a voice.**

## Live demo

https://voicing-fco-o5gx7ixs.sauna.new/

A 30-second screen recording is in `demos/demo.mp4`.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST   | `/api/seed`        | Load Byron's actual FCO submission record as the genesis node |
| POST   | `/api/speak`       | Wrap text as input FCO, call ElevenLabs, wrap audio as output FCO |
| GET    | `/api/graph`       | List every node with parent links and claim ceilings |
| GET    | `/api/verify`      | Recompute the Merkle root from leaves (RFC 6962) |
| GET    | `/api/audio/:id`   | Replay any synthesized audio |

## Chain of custody

```
genesis: fco_submission_record        ← Byron's actual Lambda application packet
voice_model_spec                       ← ElevenLabs identity (ys3XeJJA4ArWMhRpcX1D)
tts_input_text ──► tts_output_audio   ← every /api/speak call
                                  ↗
previous node (latest in the graph)
```

Every TTS call chains to both the latest node in the graph AND the stable
`voice_model_spec` FCO. The voice model is part of the custody chain — not a
side-channel.

## Tech stack

- **Backend**: Hono on Cloudflare Workers, raw SQLite via `env.sql`
- **Hashing**: SHA-256 via Web Crypto, RFC 6962 Merkle (duplicate-last pairing)
- **Voice**: ElevenLabs via the Sauna proxy (bundled quota, no API key required)
- **Frontend**: React 18, single bundle, no external icon library

## Run it

This is a [Sauna App](https://sauna.ai). To deploy from this folder:

```
cd apps/voicing-fco
sauna deploy
```

Or from a Sauna chat:

```
@app_deploy { slug: "voicing-fco" }
```

## License

Apache License 2.0 — see `LICENSE`.

## Author

Byron P. Lee — `biobitworks` / `Cellico.bio` / `Yunes Foundation for Research on Aging`.
