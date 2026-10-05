import { env } from "cloudflare:workers";
import { getOtpEmail, getSignupOtpEmail } from "./emails";

// Ported from meant's Postgres version. There each function was one statement
// of data-modifying CTEs; D1 has none, so each is one env.DB.batch() instead:
// a batch is a single transaction, and a statement that throws rolls back the
// ones before it. The rules are unchanged.

const TokenScope = { EMAIL: 0, AUTHENTICATION: 1, SIGNUP: 2 } as const;

// Compile-time numeric constants are interpolated into the SQL below (safe:
// they never carry user input); only runtime values (email, hashes, now,
// username) travel as bound parameters.
const HOUR_S = 3600;
const DAY_S = 86400;
export const SESSION_TTL_S = 60 * 60 * 24 * 30; // 30 days
const OTP_TTL_S = 600; // 10 min
const OTP_MAX_ATTEMPTS = 3;

// A "failed" OTP expired unused or burned its attempts (a resend burns the
// code it replaces). New codes are refused past these caps; the cron must keep
// failed rows for the daily window (DAY_S past expiry) so these counts stay
// reconstructible.
const OTP_FAILED_MAX_HOURLY = 3;
const OTP_FAILED_MAX_DAILY = 4;
// Window to finish signup after the code is verified. Generous on purpose: this
// token is a 128-bit secret minted only on a successful OTP verify, so it is not
// brute-forceable and a short TTL buys no security — only lost signups.
const SIGNUP_TTL_S = HOUR_S;

// The limiter, as a boolean scalar subquery over the failed codes of user
// `u.id`, windowed on issuance (= expiry - ttl). `now` is the placeholder
// holding the current epoch seconds.
const otpAllowed = (now: string) => `(
  SELECT count(*) FILTER (WHERE expiry - ${OTP_TTL_S} > ${now} - ${HOUR_S}) < ${OTP_FAILED_MAX_HOURLY}
    AND count(*) < ${OTP_FAILED_MAX_DAILY}
  FROM tokens
  WHERE user_id = u.id AND scope = ${TokenScope.EMAIL}
    AND (expiry <= ${now} OR attempts >= ${OTP_MAX_ATTEMPTS})
    AND expiry - ${OTP_TTL_S} > ${now} - ${DAY_S}
)`;

export type User = {
  id: number;
  username: string;
  name: string | null;
  photoKey: string | null;
};

function sha256(data: BufferSource): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", data);
}

function generateOtpCode(): string {
  const limit = 4_294_000_000;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return (buf[0] % 1_000_000).toString().padStart(6, "0");
}

// A session/proof token is 16 random bytes. The cookie carries their hex; the
// DB stores the SHA-256 of the raw bytes (blob), hashed straight from the bytes
// at mint time. Validation decodes the cookie back to those bytes (sessionHash)
// before hashing.
async function generateSessionToken(): Promise<{
  plaintext: string;
  hash: ArrayBuffer;
}> {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const plaintext = Array.from(bytes, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return { plaintext, hash: await sha256(bytes) };
}

// null for anything that is not 16 hex-encoded bytes, i.e. no token of ours
function sessionHash(plaintext: string): Promise<ArrayBuffer> | null {
  if (!/^[0-9a-f]{32}$/.test(plaintext)) return null;
  const bytes = Uint8Array.from(plaintext.match(/../g)!, (h) =>
    parseInt(h, 16),
  );
  return sha256(bytes);
}

// OTP hashes are salted with the email so identical codes across users never
// collide on the tokens.hash primary key (and can't be rainbow-tabled).
function otpHash(email: string, code: string): Promise<ArrayBuffer> {
  return sha256(new TextEncoder().encode(`${email}:${code}`));
}

function nowEpochS(): number {
  return Math.floor(Date.now() / 1000);
}

const isUniqueViolation = (e: unknown) =>
  String(e instanceof Error ? e.message : e).includes("UNIQUE constraint");

/**
 * Issue an email code for sign-in or sign-up alike: an unknown email gets an
 * inactive account + a welcome code, a known one gets a sign-in code. Opaque on
 * purpose — run it in waitUntil and answer the same thing either way, so the
 * caller never learns whether the address had an account or hit the limiter.
 */
export async function authIssueOtp(email: string): Promise<void> {
  email = email.toLowerCase();
  const now = nowEpochS();

  try {
    // same user can draw the same code twice while the old row is still
    // retained (PK is the hash) — regenerate on the rare UNIQUE violation
    for (let attempt = 0; attempt < 2; attempt++) {
      const code = generateOtpCode();
      const hash = await otpHash(email, code);
      try {
        const [, issued, , user] = await env.DB.batch<{
          username: string | null;
          active: number;
        }>([
          // 1. a first-time email gets an inactive account
          env.DB.prepare(
            `INSERT INTO users (email, active, created_at) VALUES (?1, 0, ?2)
            ON CONFLICT (email) DO NOTHING`,
          ).bind(email, now),
          // 2. the new code, only while the limiter allows one
          env.DB.prepare(
            `INSERT INTO tokens (hash, user_id, expiry, scope)
            SELECT ?3, u.id, ?2 + ${OTP_TTL_S}, ${TokenScope.EMAIL}
            FROM users u WHERE u.email = ?1 AND ${otpAllowed("?2")}`,
          ).bind(email, now, hash),
          // 3. supersede the code it replaces, only if 2 issued one. Burning
          // attempts (never expiry) keeps the reconstructed issuance truthful.
          env.DB.prepare(
            `UPDATE tokens SET attempts = ${OTP_MAX_ATTEMPTS}
            WHERE user_id = (SELECT id FROM users WHERE email = ?1)
              AND scope = ${TokenScope.EMAIL} AND expiry > ?2
              AND attempts < ${OTP_MAX_ATTEMPTS} AND hash <> ?3
              AND EXISTS (SELECT 1 FROM tokens WHERE hash = ?3 AND expiry = ?2 + ${OTP_TTL_S})`,
          ).bind(email, now, hash),
          // 4. who the mail is for
          env.DB.prepare(
            `SELECT username, active FROM users WHERE email = ?1`,
          ).bind(email),
        ]);

        // rate-limited: silently send nothing
        const to = user.results[0];
        if (issued.meta.changes !== 1 || !to) return;

        if (import.meta.env.DEV) console.log(`code for ${email}: ${code}`);
        // active account -> sign-in code; pending (never activated) -> a
        // welcome code that has no username to greet yet
        await env.EMAIL.send({
          to: email,
          from: { name: "oder.locker", email: env.EMAIL_FROM },
          ...(to.active === 1
            ? getOtpEmail(to.username!, code, email)
            : getSignupOtpEmail(code, email)),
        });
        return;
      } catch (e) {
        if (isUniqueViolation(e)) continue;
        throw e;
      }
    }
    console.error("could not store a unique OTP");
  } catch (e) {
    console.error("error while issuing a code:", e);
  }
}

/**
 * A correct code is consumed (single use) and mints a token; a wrong one burns
 * an attempt on the active code instead. An active account gets a session
 * (pending: false); a pending one gets a SIGNUP proof that authCompleteSignup
 * consumes. null covers every failure alike: wrong, expired, burned, unknown.
 */
export async function authVerifyCode(
  email: string,
  code: string,
): Promise<{ pending: boolean; token: string } | null> {
  email = email.toLowerCase();
  const now = nowEpochS();

  try {
    const session = await generateSessionToken();
    const otp = await otpHash(email, code);

    const [minted, , , user] = await env.DB.batch<{ active: number }>([
      // 1. mint the session or signup proof, if the code matches a live one
      env.DB.prepare(
        `INSERT INTO tokens (hash, user_id, expiry, scope)
        SELECT ?1, u.id,
          ?2 + CASE WHEN u.active = 1 THEN ${SESSION_TTL_S} ELSE ${SIGNUP_TTL_S} END,
          CASE WHEN u.active = 1 THEN ${TokenScope.AUTHENTICATION} ELSE ${TokenScope.SIGNUP} END
        FROM users u JOIN tokens t ON t.user_id = u.id
        WHERE u.email = ?3 AND t.hash = ?4 AND t.scope = ${TokenScope.EMAIL}
          AND t.expiry > ?2 AND t.attempts < ${OTP_MAX_ATTEMPTS}`,
      ).bind(session.hash, now, email, otp),
      // 2. otherwise burn an attempt on the live code
      env.DB.prepare(
        `UPDATE tokens SET attempts = attempts + 1
        WHERE user_id = (SELECT id FROM users WHERE email = ?1)
          AND scope = ${TokenScope.EMAIL} AND expiry > ?2
          AND attempts < ${OTP_MAX_ATTEMPTS}
          AND NOT EXISTS (SELECT 1 FROM tokens WHERE hash = ?3)`,
      ).bind(email, now, session.hash),
      // 3. consume the matched code
      env.DB.prepare(
        `DELETE FROM tokens
        WHERE hash = ?1 AND scope = ${TokenScope.EMAIL}
          AND EXISTS (SELECT 1 FROM tokens WHERE hash = ?2)`,
      ).bind(otp, session.hash),
      env.DB.prepare(`SELECT active FROM users WHERE email = ?1`).bind(email),
    ]);

    const row = user.results[0];
    if (minted.meta.changes !== 1 || !row) return null;
    return { pending: row.active !== 1, token: session.plaintext };
  } catch (e) {
    console.error("DB error while verifying code:", e);
    return null;
  }
}

/**
 * Guest sign-in: no email, no code. The guest name doubles as the account's
 * email and username (it is no valid address, so it can't meet a real one);
 * the account is created active on first use and anyone typing the same name
 * lands in it. null when the name is unavailable, i.e. a real account already
 * claimed it as its username.
 */
export async function authGuestSignIn(name: string): Promise<string | null> {
  name = name.toLowerCase();
  const now = nowEpochS();

  try {
    const session = await generateSessionToken();

    const [, minted] = await env.DB.batch([
      // 1. a first-time guest name gets its account; a known one, or a name
      // taken as someone's username, changes nothing
      env.DB.prepare(
        `INSERT INTO users (email, username, active, created_at) VALUES (?1, ?1, 1, ?2)
        ON CONFLICT DO NOTHING`,
      ).bind(name, now),
      // 2. the session, only for the guest account itself
      env.DB.prepare(
        `INSERT INTO tokens (hash, user_id, expiry, scope)
        SELECT ?3, u.id, ?2 + ${SESSION_TTL_S}, ${TokenScope.AUTHENTICATION}
        FROM users u WHERE u.email = ?1 AND u.username = ?1 AND u.active = 1`,
      ).bind(name, now, session.hash),
    ]);

    return minted.meta.changes === 1 ? session.plaintext : null;
  } catch (e) {
    console.error("DB error while signing in a guest:", e);
    return null;
  }
}

/** Whether a signup proof is still good, checked before accepting an upload. */
export async function authSignupProofValid(token: string): Promise<boolean> {
  const hash = await sessionHash(token);
  if (!hash) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT 1 FROM tokens t JOIN users u ON u.id = t.user_id
      WHERE t.hash = ?1 AND t.scope = ${TokenScope.SIGNUP} AND t.expiry > ?2 AND u.active = 0`,
    )
      .bind(hash, nowEpochS())
      .first();
    return row !== null;
  } catch (e) {
    console.error("DB error while checking signup proof:", e);
    return false;
  }
}

/**
 * A valid SIGNUP proof on a pending account claims the username, stores the
 * profile and activates, then trades the proof for a session. A taken username
 * aborts the whole batch, so the proof survives for a retry with another name.
 * null means the proof is gone (expired or already used).
 */
export async function authCompleteSignup(
  token: string,
  profile: { username: string; name: string | null; photoKey: string | null },
): Promise<
  { token: string } | { error: "username_taken" | "invalid_username" } | null
> {
  const username = profile.username.trim();
  if (!username || username.length > 40) return { error: "invalid_username" };

  const proof = await sessionHash(token);
  if (!proof) return null;
  const now = nowEpochS();

  try {
    const session = await generateSessionToken();

    const [, activated] = await env.DB.batch([
      // 1. mint the session while the proof is still there to check
      env.DB.prepare(
        `INSERT INTO tokens (hash, user_id, expiry, scope)
        SELECT ?1, t.user_id, ?2 + ${SESSION_TTL_S}, ${TokenScope.AUTHENTICATION}
        FROM tokens t JOIN users u ON u.id = t.user_id
        WHERE t.hash = ?3 AND t.scope = ${TokenScope.SIGNUP} AND t.expiry > ?2 AND u.active = 0`,
      ).bind(session.hash, now, proof),
      // 2. claim the username and activate
      env.DB.prepare(
        `UPDATE users SET username = ?1, name = ?2, photo_key = ?3, active = 1
        WHERE active = 0 AND id = (
          SELECT user_id FROM tokens
          WHERE hash = ?4 AND scope = ${TokenScope.SIGNUP} AND expiry > ?5
        )`,
      ).bind(username, profile.name, profile.photoKey, proof, now),
      // 3. the proof is spent, along with any sibling from a second tab
      env.DB.prepare(
        `DELETE FROM tokens
        WHERE scope = ${TokenScope.SIGNUP}
          AND user_id = (SELECT user_id FROM tokens WHERE hash = ?1)`,
      ).bind(session.hash),
    ]);

    if (activated.meta.changes !== 1) return null;
    return { token: session.plaintext };
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "username_taken" };
    console.error("DB error while completing signup:", e);
    return null;
  }
}

export async function authValidateSession(token: string): Promise<User | null> {
  const hash = await sessionHash(token);
  if (!hash) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT u.id, u.username, u.name, u.photo_key
      FROM tokens t JOIN users u ON u.id = t.user_id
      WHERE t.hash = ?1 AND t.expiry > ?2 AND t.scope = ${TokenScope.AUTHENTICATION}`,
    )
      .bind(hash, nowEpochS())
      .first<{
        id: number;
        username: string;
        name: string | null;
        photo_key: string | null;
      }>();
    return (
      row && {
        id: row.id,
        username: row.username,
        name: row.name,
        photoKey: row.photo_key,
      }
    );
  } catch (e) {
    console.error("DB error while validating session:", e);
    return null;
  }
}

export async function authSignOut(token: string): Promise<void> {
  const hash = await sessionHash(token);
  if (!hash) return;
  try {
    await env.DB.prepare(
      `DELETE FROM tokens WHERE hash = ?1 AND scope = ${TokenScope.AUTHENTICATION}`,
    )
      .bind(hash)
      .run();
  } catch (e) {
    console.error("DB error while signing out:", e);
  }
}

/**
 * Cron cleanup. Expired EMAIL tokens are kept 24h past expiry: the limiter
 * reconstructs its daily failed-code window from them.
 */
export async function authPurgeExpiredTokens(): Promise<void> {
  try {
    await env.DB.prepare(
      `DELETE FROM tokens
      WHERE (scope IN (${TokenScope.AUTHENTICATION}, ${TokenScope.SIGNUP}) AND expiry < ?1)
        OR (scope = ${TokenScope.EMAIL} AND expiry < ?1 - ${DAY_S})`,
    )
      .bind(nowEpochS())
      .run();
  } catch (e) {
    console.error("DB error while purging expired tokens:", e);
  }
}
