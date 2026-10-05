import { env } from "cloudflare:workers";
import { redirect } from "react-router";
import { authValidateSession, SESSION_TTL_S, type User } from "./auth.server";

export const emailRx =
  /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// "guest" or "guest_<anything>", typed in place of an email: signs straight in,
// no code (see authGuestSignIn). Never matches emailRx, and capped at the 40
// characters a username may have.
export const guestRx = /^guest(?:_\S{1,34})?$/i;

export function getSessionToken(request: Request): string | undefined {
  return request.headers
    .get("cookie")
    ?.split("; ")
    .find((row) => row.startsWith("iam="))
    ?.substring(4);
}

// SameSite=Lax on purpose: Strict cookies are withheld on cross-site top-level
// navigations, so every entry from an email/chat/search link would look logged
// out even with a valid session.
export function sessionHeaders(token: string): Headers {
  const attrs = `Path=/; Max-Age=${SESSION_TTL_S}; Secure; SameSite=Lax`;
  const headers = new Headers();
  headers.append("Set-Cookie", `iam=${token}; HttpOnly; ${attrs}`);
  return headers;
}

export function clearSessionHeaders(): Headers {
  const attrs = `Path=/; Max-Age=0; Secure; SameSite=Lax`;
  const headers = new Headers();
  headers.append("Set-Cookie", `iam=; HttpOnly; ${attrs}`);
  return headers;
}

/** Gate for actions whose submissions trigger an email: canonical Turnstile siteverify. */
export async function verifyTurnstile(
  formData: FormData,
  request: Request,
): Promise<boolean> {
  const token = formData.get("cf-turnstile-response");
  if (typeof token !== "string" || !token) return false;
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) body.set("remoteip", ip);
  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  const outcome = (await res.json()) as { success: boolean };
  return outcome.success;
}

/** The signed-in user, or null. */
export async function getUser(request: Request): Promise<User | null> {
  const token = getSessionToken(request);
  return token ? authValidateSession(token) : null;
}

/** For loaders of signed-in-only pages: sends everyone else to sign in, and back after. */
export async function requireUser(request: Request): Promise<User> {
  const user = await getUser(request);
  if (user) return user;
  const { pathname, search } = new URL(request.url);
  throw redirect(`/?next=${encodeURIComponent(pathname + search)}`);
}
