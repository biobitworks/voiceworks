// RFC 6962 Merkle primitives, lifted into TypeScript.
// Same primitives Glasswork uses: leaf 0x00, node 0x01, duplicate-last pairing.
// All hashes are SHA-256; we use Web Crypto so it works in the worker.

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < b.length; i++) out += b[i].toString(16).padStart(2, "0");
  return out;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  // crypto.subtle.digest requires a BufferSource backed by a real ArrayBuffer.
  const buf = new ArrayBuffer(bytes.length);
  new Uint8Array(buf).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return toHex(digest);
}

// RFC 6962 leaf: SHA-256(0x00 || bytes)
export async function leafHash(bytes: Uint8Array | string): Promise<string> {
  const data = typeof bytes === "string" ? enc.encode(bytes) : bytes;
  const prefix = new Uint8Array([0x00]);
  const concat = new Uint8Array(prefix.length + data.length);
  concat.set(prefix, 0);
  concat.set(data, prefix.length);
  return sha256(concat);
}

// RFC 6962 node: SHA-256(0x01 || left || right)
export async function nodeHash(left: string, right: string): Promise<string> {
  const l = hexToBytes(left);
  const r = hexToBytes(right);
  const prefix = new Uint8Array([0x01]);
  const concat = new Uint8Array(prefix.length + l.length + r.length);
  concat.set(prefix, 0);
  concat.set(l, prefix.length);
  concat.set(r, prefix.length + l.length);
  return sha256(concat);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

// RFC 6962 root with duplicate-last pairing (used by Glasswork / FCO/FCG).
// For an odd number of leaves at any level, the last leaf is duplicated.
export async function merkleRoot(leaves: string[]): Promise<string> {
  if (leaves.length === 0) {
    return "0000000000000000000000000000000000000000000000000000000000000000";
  }
  if (leaves.length === 1) return leaves[0];

  let level = leaves.slice();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i];
      const r = i + 1 < level.length ? level[i + 1] : level[i]; // dup-last
      next.push(await nodeHash(l, r));
    }
    level = next;
  }
  return level[0];
}

// Build a minimal FCO envelope from a payload and a list of parent hashes.
// Returns the canonical JSON-serializable form whose content-leaf hash is stable.
export interface FcoEnvelope {
  fco_version: "0.1-draft";
  object_type: string;
  parents: string[]; // sha256:<hex> or sha256:<hex>...
  payload: { media_type: string; bytes_sha256: string; byte_length: number };
  authorization: { author: string; release_class: string };
  claim: { type: string; statement: string; claim_ceiling: string };
  created_at_utc: string;
}

export async function buildFco(opts: {
  object_type: string;
  payload_bytes: Uint8Array | string;
  payload_media_type: string;
  parents: string[];
  authorization: { author: string; release_class: string };
  claim: { type: string; statement: string; claim_ceiling: string };
}): Promise<{ envelope: FcoEnvelope; object_id: string; content_leaf: string; op_leaf: string }> {
  const data = typeof opts.payload_bytes === "string"
    ? enc.encode(opts.payload_bytes)
    : opts.payload_bytes;
  const bytes_sha256 = await sha256(data);

  const envelope: FcoEnvelope = {
    fco_version: "0.1-draft",
    object_type: opts.object_type,
    parents: opts.parents,
    payload: {
      media_type: opts.payload_media_type,
      bytes_sha256,
      byte_length: data.length,
    },
    authorization: opts.authorization,
    claim: opts.claim,
    created_at_utc: new Date().toISOString(),
  };

  // Canonical JSON: deterministic key order. Simple alphabetic sort at one level deep.
  const canonical = canonicalJson(envelope);
  const content_leaf = await leafHash(canonical);

  // Operational leaf: type + media_type + bytes_sha256 + created_at_utc
  const op_preimage = `${opts.object_type}|${opts.payload_media_type}|${bytes_sha256}|${envelope.created_at_utc}`;
  const op_leaf = await leafHash(op_preimage);

  const object_id = `sha256:${content_leaf}`;
  return { envelope, object_id, content_leaf, op_leaf };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map(k => JSON.stringify(k) + ":" + canonicalJson(obj[k]));
  return "{" + parts.join(",") + "}";
}

export { sha256, toHex };
