import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";

// One row per FCO node. The custody graph lives here.
export const fcos = sqliteTable("fcos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  object_id: text("object_id").notNull().unique(), // sha256:<content-leaf-hex>
  object_type: text("object_type").notNull(),
  content_leaf: text("content_leaf").notNull(),     // sha256 hex
  op_leaf: text("op_leaf").notNull(),                // sha256 hex
  parents_json: text("parents_json").notNull(),       // JSON array of object_ids
  envelope_json: text("envelope_json").notNull(),     // full canonical FCO envelope
  payload_preview: text("payload_preview").notNull(), // first ~200 chars for display
  claim_ceiling: text("claim_ceiling").notNull(),
  created_at_utc: text("created_at_utc").notNull(),
}, (t) => ({
  byCreatedAt: index("fcos_created_idx").on(t.created_at_utc),
}));

// Audio blobs stored alongside, keyed by object_id of the FCO that produced them.
export const audioBlobs = sqliteTable("audio_blobs", {
  object_id: text("object_id").primaryKey(),
  mp3_bytes_b64: text("mp3_bytes_b64").notNull(),
  voice_id: text("voice_id").notNull(),
  model_id: text("model_id").notNull(),
  char_count: integer("char_count").notNull(),
}, () => ({}));
