import { createRequestHandler } from "react-router";
import { authPurgeExpiredTokens } from "../app/lib/auth.server";
import { getUser } from "../app/lib/session.server";

export { Discussions } from "./discussions";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

// The discussion widget's WebSocket (app/components/chat/Discussion.tsx).
// Handled here, not in a route: React Router has no way to hand back the
// upgraded socket.
async function discuss(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response(null, { status: 426 });
  }
  // A page on another site must not open this with the user's cookie.
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return new Response(null, { status: 403 });
  }
  const user = await getUser(request);
  if (!user) return new Response(null, { status: 401 });

  const headers = new Headers(request.headers);
  headers.set("x-user", encodeURIComponent(JSON.stringify(user)));
  return env.DISCUSSIONS.getByName("theme").fetch(
    new Request(request, { headers }),
  );
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/discuss") {
      return discuss(request, env);
    }
    return requestHandler(request);
  },
  async scheduled() {
    await authPurgeExpiredTokens();
  },
} satisfies ExportedHandler<Env>;
