import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { merkleRoot, leafHash } from "./lib/fco";

interface FcoNode {
  object_id: string;
  object_type: string;
  content_leaf: string;
  op_leaf: string;
  parents: string[];
  payload_preview: string;
  claim_ceiling: string;
  created_at_utc: string;
}

interface VoiceSummary {
  key: string;
  voice_id: string;
  voice_name: string;
  model_id: string;
  role: "questioner" | "answerer";
}

interface VoiceVault {
  voice_name: string;
  voice_id: string;
  spec_object_id: string;
  leaf_count: number;
  merkle_root: string;
  leaves: string[];
}

const DEMO_SCRIPT = [
  { role: "questioner", text: "What's Byron Lee's FCO/FCG paper about?" },
  { role: "answerer", text: "A proof-of-concept architecture where every artifact is a content-addressed hash that's simultaneously a graph node. RFC 6962 Merkle, claim ceilings, private payload routes. Submitted to Lambda on July 15, 2026." },
  { role: "questioner", text: "How does it connect to Sauna.ai?" },
  { role: "answerer", text: "Sauna is the AI coworker that executes tasks across your tools. FCO and FCG are the substrate: every agent action becomes a custody node. The graph has memory. The graph has a voice." },
  { role: "questioner", text: "And ElevenLabs?" },
  { role: "answerer", text: "ElevenLabs gives the graph a voice. Each TTS call wraps the prompt as an input FCO and the audio as an output FCO. The voice model spec is itself an FCO — change the voice without re-recording the spec and the chain breaks." },
  { role: "questioner", text: "What about security?" },
  { role: "answerer", text: "Custody proves provenance of bytes, not correctness. A Merkle root is tamper-evident — change one byte and the root goes red. Authenticity needs signatures; custody gives the binding check." },
  { role: "questioner", text: "Privacy?" },
  { role: "answerer", text: "Each voice has its own FCG. Outputs are leaves in a private graph. The Merkle root is the private key that gates access. The voice spec is pointer-only — only the content hash is public, the settings are gated." },
  { role: "questioner", text: "Inference?" },
  { role: "answerer", text: "The graph is the memory. The graph has a voice. When you ask a question, the system traverses the graph — it doesn't learn, it remembers. The graph is the memory. The graph has a voice." },
];

function App() {
  const [graph, setGraph] = useState<FcoNode[]>([]);
  const [verify, setVerify] = useState<any>(null);
  const [status, setStatus] = useState<string>("");
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voices, setVoices] = useState<VoiceSummary[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("sauna-main");
  const [browserRoot, setBrowserRoot] = useState<string | null>(null);
  const [rootMatch, setRootMatch] = useState<boolean | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<string[]>([]);

  const [speakText, setSpeakText] = useState(
    "This is a Fractal Custody Object from the FCO FCG preprint by Byron P Lee. Every agent action is a custody node, and the graph itself has a voice."
  );

  // Admission-rule demo state (Tier 4: the user's vault boundary)
  const [admitBytes, setAdmitBytes] = useState("hello, FCO vault");
  const [admitClaim, setAdmitClaim] = useState("");
  const [admitComputed, setAdmitComputed] = useState<string | null>(null);
  const [admitResult, setAdmitResult] = useState<any>(null);

  async function refreshVoices() {
    const r = await fetch("/api/voices");
    if (r.ok) setVoices((await r.json()).voices ?? []);
  }

  async function refreshGraph(): Promise<FcoNode[]> {
    const r = await fetch("/api/graph");
    const data = await r.json();
    const nodes = data.nodes ?? [];
    setGraph(nodes);
    return nodes;
  }

  async function refreshVerify() {
    const r = await fetch("/api/verify");
    if (!r.ok) return;
    const data = await r.json();
    setVerify(data);
  }

  async function recomputeInBrowser(nodes: FcoNode[], serverVerify: any) {
    try {
      const leaves = nodes.map((n: FcoNode) => n.content_leaf);
      const browserR = await merkleRoot(leaves);
      setBrowserRoot(browserR);
      setRootMatch(serverVerify ? browserR === serverVerify.computed_root : null);
    } catch {
      setBrowserRoot(null);
      setRootMatch(false);
    }
  }

  useEffect(() => {
    (async () => {
      await refreshVoices();
      const nodes = await refreshGraph();
      await refreshVerify();
      await recomputeInBrowser(nodes, verify);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (graph.length > 0 && verify) recomputeInBrowser(graph, verify);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verify, graph.length]);

  async function seed() {
    setBusy(true);
    setStatus("Seeding genesis node from Byron's FCO submission record...");
    await fetch("/api/seed", { method: "POST" });
    const nodes = await refreshGraph();
    await refreshVerify();
    await recomputeInBrowser(nodes, verify);
    setStatus("Seeded.");
    setBusy(false);
  }

  async function speak() {
    setBusy(true);
    setStatus(`Wrapping text as input FCO → calling ElevenLabs (${selectedVoice}) → wrapping audio as output FCO...`);
    const r = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: speakText, voice: selectedVoice }),
    });
    const data = await r.json();
    setAudioSrc(data.audio_data_uri);
    setStatus(`Spoke ${data.char_count} chars via ${data.voice} (${data.voice_id}) / ${data.model_id}. Two new FCOs added.`);
    const nodes = await refreshGraph();
    await refreshVerify();
    await recomputeInBrowser(nodes, verify);
    setBusy(false);
    setTimeout(() => audioRef.current?.play(), 100);
  }

  async function playQueue() {
    while (queueRef.current.length > 0) {
      const src = queueRef.current.shift()!;
      setAudioSrc(src);
      await new Promise<void>((resolve) => {
        const el = audioRef.current;
        if (!el) { resolve(); return; }
        el.src = src;
        el.onended = () => resolve();
        el.play().catch(() => resolve());
      });
    }
  }

  async function runScript() {
    setBusy(true);
    setStatus(`Running ${DEMO_SCRIPT.length}-turn demo script (sauna-main + david)...`);
    const r = await fetch("/api/converse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: DEMO_SCRIPT }),
    });
    const data = await r.json();
    queueRef.current = (data.turns ?? []).map((t: any) => t.audio_data_uri).filter(Boolean);
    setStatus(`Converse complete: ${data.count} turns, ${queueRef.current.length} audio chunks queued. Playing now.`);
    const nodes = await refreshGraph();
    await refreshVerify();
    await recomputeInBrowser(nodes, verify);
    setBusy(false);
    playQueue();
  }

  // Admission rule: compute the canonical leaf hash for `admitBytes` in the browser,
  // and prefill the claimed field with that hash so /api/admit returns ADMITTED.
  async function computeAdmitHash() {
    const bytes = new TextEncoder().encode(admitBytes);
    const h = await leafHash(bytes);
    setAdmitComputed(h);
    setAdmitClaim(h);
    setAdmitResult(null);
  }

  // Submission to the user's vault boundary.
  async function tryAdmit() {
    if (!admitClaim || !admitBytes) return;
    setBusy(true);
    setStatus("Submitting to the user's vault: admission rule per preprint §3...");
    const r = await fetch("/api/admit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimed_digest: admitClaim, named_bytes: admitBytes }),
    });
    const data = await r.json();
    setAdmitResult(data);
    setStatus(`${data.verdict} — see the verdict card below.`);
    const nodes = await refreshGraph();
    await refreshVerify();
    await recomputeInBrowser(nodes, verify);
    setBusy(false);
  }

  // Pull the user's private vault root (the genesis FCO's content_leaf).
  const userVaultRoot = (graph.find(n => n.object_type === "fco_submission_record")?.content_leaf) ?? null;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <h1>Voicing FCO</h1>
      <p className="sub">
        Four-tier voice custody: <strong>user vault</strong> · <strong>voice FCO</strong> · <strong>agent FCG</strong> · <strong>chain of custody</strong>.
        The graph is the memory. The graph has a voice.
      </p>

      {/* Four-tier architecture banner */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <h2>Four-tier custody architecture</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.6rem", marginTop: "0.5rem" }}>
          <div className="tier" data-tier="1">
            <div className="tier-num">1</div>
            <div className="tier-name">User vault</div>
            <div className="tier-body">Holds the private Merkle root key. Gates what enters the chain.</div>
          </div>
          <div className="tier" data-tier="2">
            <div className="tier-num">2</div>
            <div className="tier-name">Voice FCO</div>
            <div className="tier-body">Each voice output tokenized as a content-addressed FCO.</div>
          </div>
          <div className="tier" data-tier="3">
            <div className="tier-num">3</div>
            <div className="tier-name">Agent FCG</div>
            <div className="tier-body">Each AI agent (Sauna, ElevenLabs) keeps its own Merkle tree.</div>
          </div>
          <div className="tier" data-tier="4">
            <div className="tier-num">4</div>
            <div className="tier-name">Chain of custody</div>
            <div className="tier-body">Tamper-evident graph linking every FCO through RFC 6962.</div>
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2>Two-voice demo script</h2>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
            {DEMO_SCRIPT.length} turns (Q + A) about Byron's FCO/FCG paper, Sauna, ElevenLabs, security, privacy, inference. Voice <code>sauna-main</code> = questioner, <code>david</code> = answerer. Each turn wraps as <strong>two FCOs</strong> in the agent's FCG.
          </p>
          <div className="row">
            <button onClick={runScript} disabled={busy}>▶ Run demo script</button>
            <button className="ghost" onClick={seed} disabled={busy}>Seed genesis</button>
          </div>

          <h2 style={{ marginTop: "1.25rem" }}>Speak arbitrary text</h2>
          <textarea
            value={speakText}
            onChange={(e) => setSpeakText(e.target.value)}
          />
          <div className="row">
            <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value)} style={selectStyle}>
              {voices.map(v => (
                <option key={v.key} value={v.key}>{v.voice_name} ({v.role})</option>
              ))}
            </select>
            <button onClick={speak} disabled={busy}>Speak</button>
          </div>

          {audioSrc && (
            <audio ref={audioRef} controls src={audioSrc} />
          )}
          {status && <div className="status">{status}</div>}
        </div>

        <div className="card">
          <h2>Custody graph ({graph.length} nodes)</h2>
          {verify && (
            <div style={{ marginBottom: "0.75rem" }}>
              <span className={`pill ${rootMatch ? "verify-ok" : "verify-err"}`}>
                {rootMatch === null ? "—" : rootMatch ? "✓ browser recomputed — matches server" : "✗ MISMATCH"}
              </span>
              <span className="pill">{verify.leaf_count} leaves</span>
              <div className="root">
                <strong>Tier 4 — Full chain root</strong>: {verify.computed_root}
              </div>
            </div>
          )}

          {/* Tier 1: user vault */}
          {userVaultRoot && (
            <div style={{ marginBottom: "0.75rem", padding: "0.5rem", background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)" }}>
              <strong style={{ fontSize: "0.75rem", color: "var(--accent)" }}>Tier 1 — User's private vault root</strong>
              <div className="root" style={{ marginTop: "0.25rem", fontSize: "0.72rem" }}>{userVaultRoot}</div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                This is what the user keeps private. Only this root's holders can verify the chain.
              </div>
            </div>
          )}

          {/* Tier 3: per-agent FCG */}
          {verify && verify.by_voice && (
            <div style={{ marginBottom: "0.75rem" }}>
              <strong style={{ fontSize: "0.75rem", color: "var(--green)" }}>Tier 3 — Agent FCGs (per-agent Merkle trees)</strong>
              {Object.entries(verify.by_voice as Record<string, VoiceVault>).map(([key, v]) => (
                <div key={key} style={{ marginTop: "0.4rem", fontSize: "0.78rem", fontFamily: "var(--mono)" }}>
                  <span className="pill" style={{ background: key === "sauna-main" ? "var(--accent)" : "var(--green)", color: "#1a1a1a" }}>
                    {v.voice_name}
                  </span>
                  {" "}<span style={{ color: "var(--muted)" }}>{v.leaf_count} leaves</span>
                  {" "}<span style={{ wordBreak: "break-all" }}>root: {v.merkle_root}</span>
                </div>
              ))}
              <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                Each AI agent keeps its own custody chain. The per-agent Merkle root is what gates that agent's voice data.
              </div>
            </div>
          )}

          <div className="graph">
            {graph.slice().reverse().map((n) => {
              const preview = n.payload_preview || "";
              const ceiling = n.claim_ceiling || "";
              const parents = n.parents || [];
              const tierBadge =
                n.object_type === "fco_submission_record" ? "T1" :
                n.object_type === "voice_model_spec" ? "T1" :
                n.object_type.startsWith("turn_") ? "T2" :
                n.object_type.startsWith("admission_") ? "T1" :
                "T4";
              return (
              <div key={n.object_id} className={`node ${n.object_type === "fco_submission_record" || n.object_type === "voice_model_spec" ? "genesis" : ""}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div className="type">{(n.object_type || "node").replace(/_/g, " ")}</div>
                  <span className="pill" style={{ fontSize: "0.65rem" }}>Tier {tierBadge.slice(1)}</span>
                </div>
                <div className="id">{n.object_id}</div>
                <div className="preview">{preview.slice(0, 120)}{preview.length > 120 ? "..." : ""}</div>
                <div className="ceiling">ceiling: {ceiling.slice(0, 80)}{ceiling.length > 80 ? "..." : ""}</div>
                {parents.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <span className="pill">↑ {parents.length} parent{parents.length > 1 ? "s" : ""}</span>
                    {parents.map((p: string, i: number) => (
                      <span key={i} className="pill" title={p}>{(p || "").slice(0, 24)}…</span>
                    ))}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tier 1: admission rule — the user's vault boundary */}
      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2>Tier 1 in action: the user's vault boundary (admission rule, preprint §3)</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
          An agent (Sauna, ElevenLabs, anyone) can assert a digest. The user's vault admits it only if the digest
          recomputes from the named bytes. Try it: compute the correct hash, click "Try admit" — ADMITTED. Then
          tamper with one character of the claim — REJECTED, with a custody leaf recording the refusal.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Named bytes (UTF-8 text)</label>
            <textarea
              value={admitBytes}
              onChange={(e) => setAdmitBytes(e.target.value)}
              style={{ minHeight: 60, fontFamily: "var(--mono)", fontSize: "0.85rem" }}
            />
            <div className="row">
              <button onClick={computeAdmitHash} disabled={busy}>Compute correct hash</button>
            </div>
            {admitComputed && (
              <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.4rem", fontFamily: "var(--mono)", wordBreak: "break-all" }}>
                recomputed: <span style={{ color: "var(--accent)" }}>{admitComputed}</span>
              </div>
            )}
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Agent's claimed digest (try tampering!)</label>
            <textarea
              value={admitClaim}
              onChange={(e) => setAdmitClaim(e.target.value)}
              style={{ minHeight: 60, fontFamily: "var(--mono)", fontSize: "0.85rem" }}
            />
            <div className="row">
              <button onClick={tryAdmit} disabled={busy || !admitClaim || !admitBytes}>Try admit</button>
            </div>
          </div>
        </div>
        {admitResult && (
          <div style={{ marginTop: "0.75rem", padding: "0.75rem", borderRadius: 6, border: `2px solid ${admitResult.admitted ? "var(--green)" : "var(--red)"}`, background: "var(--bg)" }}>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: admitResult.admitted ? "var(--green)" : "var(--red)" }}>
              {admitResult.verdict}
            </div>
            <div style={{ fontSize: "0.8rem", marginTop: "0.4rem", fontFamily: "var(--mono)" }}>
              claimed: {admitResult.claimed_digest}<br />
              recomputed: {admitResult.recomputed_digest}<br />
              match: <strong>{admitResult.claimed_digest === admitResult.recomputed_digest ? "yes" : "no"}</strong>
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.4rem" }}>
              {admitResult.note} Recorded as FCO <code>{admitResult.node?.slice(0, 24)}…</code>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2>What this is</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          Inspired by <em>Fractal Custody Objects and Graphs for Efficient, Verifiable AI Training and Computational Biology</em>,
          the registered research protocol submitted by Byron P. Lee to Lambda on July 15, 2026.
          Every piece of data — including each voice byte — is an FCO. Every voice's outputs form a sub-FCG rooted at that voice's spec.
          The per-agent Merkle root is the <em>private Merkle root key</em> that gates that agent's voice data: only the holder of that root
          can verify what came out of that agent. The total graph root is tamper-evident: the browser recomputes it from the shipped
          leaves and rejects a mismatch. The admission rule (§3) ensures the user's vault refuses to admit agent-asserted digests that
          cannot be independently re-derived from the named bytes — even when the bytes themselves were not seen.
        </p>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)",
  borderRadius: 6, padding: "0.4rem 0.6rem", fontFamily: "var(--mono)", fontSize: "0.85rem",
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
