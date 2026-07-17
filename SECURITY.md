# SECURITY

How `voiceworks` is built **into** Sauna's secure-AI architecture — not bolted
on. This document explains the design choices that make the demo safe to run on
real voice data, and the FCO/FCG primitives that make every action auditable.

Voiceworks is a Sauna App, so it inherits every guarantee the Sauna platform
already enforces, then layers on a per-voice cryptographic vault.

---

## 1. Built into Sauna — what the platform already gives us

A Sauna App is deployed code that runs on Cloudflare Workers with these
defaults, all pinned at deploy time:

| Guarantee | How Sauna provides it |
|-----------|-----------------------|
| **No API keys stored in our repo.** | ElevenLabs voice is reached via `https://sauna.local/v1/elevenlabs/...` — the Sauna proxy injects auth from the platform's bundled quota. Our app code does not see a token. |
| **App-isolated storage.** | Each Sauna App owns its own SQLite database; `env.sql` is per-app. No other Sauna App, agent, or session can read our graph. |
| **Network egress is scoped.** | The app only talks to `sauna.local` (the proxy) and the public ElevenLabs endpoint; it cannot reach arbitrary hosts unless explicitly allowed. |
| **No state leaks across deploys.** | Module globals (`let VOICE_SPEC_OBJECT_ID = null`) reset on cold boot. Nothing persists except what's in `env.sql`. |
| **No `setTimeout` / no top-level randomness.** | Workers can't accidentally write background timers that would break hibernation. |

Result: the *only* attack surface for the app is the code we ship, the SQLite
database the app owns, and the four HTTP endpoints it exposes.

## 2. The custody primitive — FCO/FCG

The point of the FCO/FCG design is that no part of the system has to be
*trusted* — every part has to *prove itself*. Concretely:

- **Every text-to-speech call** writes two FCOs into the graph: one for the
  input text, one for the synthesized audio bytes. Both hash-addressed.
- **Every FCO has a `claim_ceiling`** — a one-sentence bound on what that
  record is allowed to prove. The /api/verify endpoint recomputes the root
  from the leaves; the browser does it too.
- **The voice model spec is a stable FCO**, not a side-channel. Every TTS
  call chains to it as a parent. A different voice, a different identity in
  the chain.

So when you ask *"did the agent touch X?"* the answer is never "I think so" —
it's a hash recomputation.

## 3. Per-voice vault with a private Merkle root

Every voice has its **own sub-graph** — a vault. The vault root is the
Merkle root of every FCO whose parent list includes that voice's
`voice_model_spec` object_id.

```
voiceworks global root
└── sauna-main vault root    ← all TTS outputs spoken by sauna-main
    └── david vault root     ← all TTS outputs spoken by david
        └── ...
```

The private Merkle root for a voice is the cryptographic key that gates
access to that speaker's outputs. You can hand it out to anyone — they can
verify the vault's contents — without giving them the audio bytes
themselves. This is the same model as a transparency-log key (Certificate
Transparency, Sigstore Rekor), applied to voice.

## 4. The admission rule

The preprint's core novel claim (§3, §4) is that **an agent-asserted digest
is admitted to the graph only when it is independently re-derivable from
named bytes.** Voiceworks implements this at `/api/admit`:

```
POST /api/admit { claimed_digest, named_bytes }
→ 200 { verdict: "ADMITTED" | "REJECTED", recomputed_digest, node }
```

The decision (admitted OR rejected) is itself an FCO in the chain. So the
graph records who tried to assert what, and how the vault responded. A
forged agent output gets a `admission_decision_rejected` FCO that points
back to the inputs that failed — visible in the graph forever.

## 5. Built-in adversarial robustness

- **Tamper detection**: change any byte in any FCO (or any audio blob), and
  the global root changes. The UI shows "Merkle root matches server" or
  doesn't — recomputed in the browser from the leaves.
- **Replay protection**: FCO timestamps (`created_at_utc`) are first-class.
  Each FCO has a unique content leaf, so the same input text twice produces
  two different object_ids (because the timestamp differs).
- **Voice substitution detection**: every TTS output references the
  `voice_id` in the audio blob row. If a different voice claims the same
  content_leaf, the envelope's op_leaf differs and the graph refuses to
  admit it as the same FCO.
- **No silent failure paths**: every state-changing endpoint returns an FCO.
  No background jobs, no schedulers, no timers. Whatever the graph contains
  is what you see.

## 6. Privacy — what we deliberately don't do

- **No raw transcripts leave the app.** The graph and the audio blobs live
  in the app's own SQLite database. The browser fetches JSON, not audio
  bytes, for everything except explicit play requests to `/api/audio/:id`.
- **No analytics, no telemetry, no third-party scripts.** Cloudflare's
  RUM beacon is the only client-side request beyond the app's own endpoints.
- **No log shipping.** App logs (`@tool/app_logs`) are session-scoped.
- **No `eval`, no `Function()`, no dynamic import.** The bundler is
  strict-mode TypeScript; nothing reaches a `vm`-style execution path.

## 7. What the user controls

- The app is **private-by-default**. `visibility: public` in the manifest
  exposes the URL, but the data inside is still gated by the SQLite
  boundary.
- The voice vault **key is yours**. Each voice has its own Merkle root
  computed in-browser; you can publish the root without publishing the
  leaves.
- **You choose what to admit.** The `/api/admit` endpoint is opt-in:
  nothing enters the graph without passing the re-derivation test.

## 8. Where this fits in Sauna's bigger security story

Sauna's broader promise: *the AI acts on your behalf, but only inside scopes
you pinned at deploy time, with every action observable and reproducible.*
Voiceworks is the natural extension of that promise into voice: every
spoken word is bound to a voice identity, every voice identity is bound to
a Merkle root, every Merkle root is reproducible by anyone with the leaves.
The hack-night demo is just the smallest end of this — voice vault keys
scaling to multi-speaker scientific workflows is the same primitive.

---

*For the canonical reference, see Byron P. Lee's preprint:*
*Fractal Custody Objects and Graphs for Efficient, Verifiable AI Training
and Computational Biology — Zenodo DOI `10.5281/zenodo.21210575`.*
