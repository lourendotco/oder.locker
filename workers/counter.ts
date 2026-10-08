import { DurableObject } from "cloudflare:workers";

export class OnlineCounter extends DurableObject {
  // fetch, not an RPC method: a Response loses its webSocket on the way back
  // from an RPC call, and the upgrade then fails with a 500.
  async fetch() {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    this.notifyLive();
    return new Response(null, { status: 101, webSocket: client });
  }

  // `gone`: the socket whose close is being handled. It can still
  // be in getWebSockets() while its own handler runs, so it is left out by
  // hand instead of trusting the list.
  notifyLive(gone?: WebSocket) {
    const sockets = this.ctx
      .getWebSockets()
      .filter(
        (socket) => socket !== gone && socket.readyState === WebSocket.OPEN,
      );
    for (const socket of sockets) {
      // One socket that won't take the message must not cost the rest
      // theirs.
      try {
        socket.send(String(sockets.length));
      } catch {}
    }
  }

  webSocketClose(ws: WebSocket) {
    this.notifyLive(ws);
  }
}
