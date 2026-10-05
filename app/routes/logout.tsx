import { waitUntil } from "cloudflare:workers";
import { redirectDocument } from "react-router";
import type { Route } from "./+types/logout";
import { authSignOut } from "~/lib/auth.server";
import { clearSessionHeaders, getSessionToken } from "~/lib/session.server";

export async function action({ request }: Route.ActionArgs) {
  const token = getSessionToken(request);
  if (token) waitUntil(authSignOut(token));
  throw redirectDocument("/", { headers: clearSessionHeaders() });
}
