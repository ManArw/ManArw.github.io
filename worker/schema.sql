-- One row per reaction per browser. Counts are COUNT(*) over this table,
-- and the primary key is what stops the same browser counting twice.
CREATE TABLE IF NOT EXISTS votes (
  piece TEXT NOT NULL,       -- stable piece id, e.g. substack-217679721 or blog-japan-ten-days
  reaction TEXT NOT NULL,    -- loved | think | felt | curious
  voter TEXT NOT NULL,       -- sha256 of a random per-browser token (no IPs, no accounts)
  created_at INTEGER NOT NULL,
  PRIMARY KEY (piece, reaction, voter)
);
