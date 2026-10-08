import { DurableObject } from "cloudflare:workers";
import type { Participant } from "~/lib/discussion";

// TODO: Participant needs its own SQL query which doesn't return id, and returns location instead.
// id should never be returned as it is not necessary?

// my implementation might not be able to check whether a user is already in a different conversation?
// if the user in a conversation was included in the key it could still not prevent this
//

export class DiscussionLoby extends DurableObject<Env> {
  async enter(user: Participant): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    const [waiter] = this.ctx.getWebSockets();

    if (!waiter) {
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(user);
    } else {
      server.accept();
      const room = crypto.randomUUID();
      server.send(JSON.stringify({ type: "match", room }));
      waiter.send(JSON.stringify({ type: "match", room }));
      waiter.close(1000);
      server.close(1000);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response(null, { status: 426 });
  }
}
