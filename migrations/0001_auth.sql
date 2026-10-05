-- username is nullable: requesting a code creates the row inactive, and the
-- username is only claimed when signup completes. email and username compare
-- case-insensitively. created_at is epoch seconds.
CREATE TABLE users (
  id         INTEGER PRIMARY KEY,
  username   TEXT UNIQUE COLLATE NOCASE,
  name       TEXT,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  photo_key  TEXT,
  active     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Auth tokens (see app/lib/auth.server.ts): hash = sha256 of the plaintext
-- token, scope 0=EMAIL 1=AUTHENTICATION 2=SIGNUP, expiry = epoch seconds,
-- attempts = failed OTP verification count (max 3).
CREATE TABLE tokens (
  hash     BLOB PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expiry   INTEGER NOT NULL,
  scope    INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

-- a user's codes by scope: the limiter's window count and the active-code lookup
CREATE INDEX idx_tokens_user_scope ON tokens (user_id, scope, expiry);
