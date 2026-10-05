import { DurableObject } from "cloudflare:workers";
import {
  CONVERSATION_MS,
  EXTEND_WINDOW_MS,
  EXTENSION_MS,
  JOIN_WINDOW_MS,
  MAX_CONVERSATION_MS,
  SEARCH_MS,
  type ClientMessage,
  type OverReason,
  type Participant,
  type ServerMessage,
} from "../app/lib/discussion";

// What a socket carries (its attachment), so it survives hibernation.
type Seat = {
  user: Participant;
  /** When it started looking. */
  since: number;
  /** The conversation it is in; null while it waits for one. */
  conversation: string | null;
  /** Its SFU session, once its microphone is published. */
  session: string | null;
  /** Its connection to the SFU is up, so the others can pull its microphone. */
  live?: boolean;
  /** A publish is under way or done: there is only ever one. */
  publishing?: boolean;
  /** Whose microphones it has asked for: each only once. */
  pulled?: number[];
  /** Told it is over and closed from here: nothing left to clean up. */
  over?: boolean;
};

// Kept in storage under `conversation:<id>`.
type Conversation = { startedAt: number; endsAt: number; votes: number[] };

const TRACK_NAME = "mic";
// An SDP for one audio track is a few kB.
const MAX_MESSAGE_LENGTH = 20_000;

const key = (id: string) => `conversation:${id}`;

/** Pairs up the users looking to discuss and runs their conversations: who
    is in them, when they end, the vote to extend, and the calls to the
    Realtime SFU that carry the audio. One instance serves everyone, so it
    walks all its sockets freely; that stops being fine at thousands of them. */
export class Discussions extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response(null, { status: 426 });
    }
    // Set by the worker (workers/app.ts) from the session, never by the client.
    const user: Participant = JSON.parse(
      decodeURIComponent(request.headers.get("x-user") ?? ""),
    );
    const { 0: client, 1: server } = new WebSocketPair();
    const seats = this.seats();

    if (seats.some(({ seat }) => seat.user.id === user.id)) {
      server.accept();
      server.send(JSON.stringify({ type: "over", reason: "busy" }));
      server.close(1000);
      return new Response(null, { status: 101, webSocket: client });
    }

    const now = Date.now();
    const seat: Seat = { user, since: now, conversation: null, session: null };
    this.ctx.acceptWebSocket(server);

    const waiter = seats
      .filter(({ seat }) => !seat.conversation)
      .sort((a, b) => a.seat.since - b.seat.since)[0];
    if (waiter) {
      const id = crypto.randomUUID();
      this.ctx.storage.kv.put<Conversation>(key(id), {
        startedAt: now,
        endsAt: now + CONVERSATION_MS,
        votes: [],
      });
      waiter.seat.conversation = seat.conversation = id;
      waiter.ws.serializeAttachment(waiter.seat);
    } else {
      seat.conversation = this.joinable(seats, now);
    }
    server.serializeAttachment(seat);

    if (seat.conversation) this.broadcast(seat.conversation);
    else send(server, { type: "waiting", remaining: SEARCH_MS });
    await this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    if (typeof data !== "string" || data.length > MAX_MESSAGE_LENGTH) return;
    let message: ClientMessage;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    const seat: Seat = ws.deserializeAttachment();
    if (!seat.conversation || seat.over) return;

    if (message.type === "extend") {
      this.vote(seat);
      await this.schedule();
      return;
    }
    if (message.type === "connected") {
      if (!seat.session || seat.live) return;
      ws.serializeAttachment({ ...seat, live: true });
      this.broadcast(seat.conversation);
      return;
    }

    try {
      if (message.type === "publish" && !seat.publishing) {
        ws.serializeAttachment({ ...seat, publishing: true });
        if (!audioOnly(message.sdp)) throw new Error("not an audio-only offer");
        const { sessionId } = await this.sfu<{ sessionId: string }>(
          "POST",
          "/sessions/new",
        );
        const { sessionDescription } = await this.sfu<Negotiation>(
          "POST",
          `/sessions/${sessionId}/tracks/new`,
          {
            sessionDescription: { type: "offer", sdp: message.sdp },
            tracks: [
              { location: "local", mid: message.mid, trackName: TRACK_NAME },
            ],
          },
        );
        // Read again: the seat may have changed while the SFU answered.
        const current: Seat = ws.deserializeAttachment();
        // Over in the meantime: what was just set up must not outlive it.
        if (current.over) return await this.silence(sessionId);
        ws.serializeAttachment({ ...current, session: sessionId });
        send(ws, { type: "published", sdp: sessionDescription.sdp });
      } else if (
        message.type === "pull" &&
        seat.session &&
        Array.isArray(message.ids)
      ) {
        // Only the microphones of those in the same conversation, and each
        // only once: every pull is more audio the SFU sends out.
        const others = this.seats().filter(
          ({ seat: other }) =>
            other.conversation === seat.conversation &&
            other.live &&
            other.user.id !== seat.user.id &&
            message.ids.includes(other.user.id) &&
            !seat.pulled?.includes(other.user.id),
        );
        if (!others.length) return send(ws, { type: "ready" });
        ws.serializeAttachment({
          ...seat,
          pulled: [
            ...(seat.pulled ?? []),
            ...others.map(({ seat: other }) => other.user.id),
          ],
        });
        const { sessionDescription } = await this.sfu<Negotiation>(
          "POST",
          `/sessions/${seat.session}/tracks/new`,
          {
            tracks: others.map(({ seat: other }) => ({
              location: "remote",
              sessionId: other.session,
              trackName: TRACK_NAME,
            })),
          },
        );
        // Over in the meantime: what was just set up must not outlive it.
        if ((ws.deserializeAttachment() as Seat).over) {
          return await this.silence(seat.session);
        }
        send(ws, { type: "offer", sdp: sessionDescription.sdp });
      } else if (message.type === "answer" && seat.session) {
        await this.sfu("PUT", `/sessions/${seat.session}/renegotiate`, {
          sessionDescription: { type: "answer", sdp: message.sdp },
        });
        send(ws, { type: "ready" });
      }
    } catch (e) {
      console.error("Realtime SFU call failed:", e);
      send(ws, { type: "audio-failed" });
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    // Completes the closing handshake where the runtime doesn't.
    try {
      ws.close(code === 1005 ? 1000 : code);
    } catch {}
    await this.left(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.left(ws);
  }

  async alarm() {
    const now = Date.now();
    for (const { ws, seat } of this.seats()) {
      if (!seat.conversation && seat.since + SEARCH_MS <= now) {
        this.dismiss(ws, seat, "none");
      }
    }
    for (const [name, { endsAt }] of this.conversations()) {
      if (endsAt <= now) await this.end(name.slice(key("").length), "ended");
    }
    await this.schedule();
  }

  /** The open sockets that still count, each with what it carries. */
  private seats(except?: WebSocket) {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN)
      .map((ws) => ({ ws, seat: ws.deserializeAttachment() as Seat }))
      .filter(({ seat }) => !seat.over);
  }

  private conversations() {
    return [...this.ctx.storage.kv.list<Conversation>({ prefix: key("") })];
  }

  private members(id: string, except?: WebSocket) {
    return this.seats(except).filter(({ seat }) => seat.conversation === id);
  }

  /** A conversation of two that started recently enough to take a third. */
  private joinable(seats: ReturnType<Discussions["seats"]>, now: number) {
    for (const [name, { startedAt }] of this.conversations()) {
      const id = name.slice(key("").length);
      const size = seats.filter(({ seat }) => seat.conversation === id).length;
      if (size === 2 && now - startedAt < JOIN_WINDOW_MS) return id;
    }
    return null;
  }

  /** Tells everyone in a conversation where it stands. */
  private broadcast(id: string, except?: WebSocket) {
    const conversation = this.ctx.storage.kv.get<Conversation>(key(id));
    if (!conversation) return;
    const members = this.members(id, except);
    const participants = members.map(({ seat }) => ({
      ...seat.user,
      live: !!seat.live,
    }));
    for (const { ws, seat } of members) {
      send(ws, {
        type: "state",
        you: seat.user.id,
        participants,
        remaining: conversation.endsAt - Date.now(),
        maxed:
          conversation.endsAt - conversation.startedAt >= MAX_CONVERSATION_MS,
        votes: conversation.votes,
      });
    }
  }

  /** Counts a participant's agreement to extend, and extends once everyone
      has agreed. */
  private vote(seat: Seat) {
    const id = seat.conversation!;
    const conversation = this.ctx.storage.kv.get<Conversation>(key(id));
    if (!conversation) return;
    const { startedAt, endsAt, votes } = conversation;
    if (
      endsAt - Date.now() > EXTEND_WINDOW_MS ||
      endsAt - startedAt >= MAX_CONVERSATION_MS
    ) {
      return;
    }
    if (!votes.includes(seat.user.id)) votes.push(seat.user.id);
    this.ctx.storage.kv.put(key(id), this.tally(id, conversation));
    this.broadcast(id);
  }

  /** The conversation, extended if all its members have voted for that. */
  private tally(
    id: string,
    conversation: Conversation,
    except?: WebSocket,
  ): Conversation {
    const members = this.members(id, except);
    const votes = conversation.votes.filter((voter) =>
      members.some(({ seat }) => seat.user.id === voter),
    );
    return votes.length && votes.length === members.length
      ? {
          ...conversation,
          endsAt: Math.min(
            conversation.endsAt + EXTENSION_MS,
            conversation.startedAt + MAX_CONVERSATION_MS,
          ),
          votes: [],
        }
      : { ...conversation, votes };
  }

  /** A socket went away by itself. */
  private async left(ws: WebSocket) {
    const seat: Seat | null = ws.deserializeAttachment();
    if (!seat || seat.over) return;
    ws.serializeAttachment({ ...seat, over: true });
    const id = seat.conversation;
    if (id) {
      const conversation = this.ctx.storage.kv.get<Conversation>(key(id));
      if (this.members(id, ws).length < 2) {
        await this.end(id, "left", ws);
      } else if (conversation) {
        // Whoever left no longer has to agree to an extension.
        this.ctx.storage.kv.put(key(id), this.tally(id, conversation, ws));
        this.broadcast(id, ws);
      }
    }
    await this.schedule();
    await this.silence(seat.session);
  }

  private async end(id: string, reason: OverReason, except?: WebSocket) {
    const members = this.members(id, except);
    for (const { ws, seat } of members) this.dismiss(ws, seat, reason);
    this.ctx.storage.kv.delete(key(id));
    await Promise.all(members.map(({ seat }) => this.silence(seat.session)));
  }

  /** Has the SFU stop everything a session sends and receives. Closing the
      socket is not enough: the audio is a connection of its own, and it flows
      for as long as the browser cares to keep that up. */
  private async silence(session: string | null) {
    if (!session) return;
    try {
      const { tracks = [] } = await this.sfu<{
        tracks?: { mid?: string; status?: string }[];
      }>("GET", `/sessions/${session}`);
      const open = tracks
        .filter(({ mid, status }) => mid && status !== "inactive")
        .map(({ mid }) => ({ mid }));
      if (!open.length) return;
      await this.sfu("PUT", `/sessions/${session}/tracks/close`, {
        tracks: open,
        force: true,
      });
    } catch (e) {
      // The SFU let go of the session first: its connection dropped before
      // the socket did, and there is nothing left to close.
      if (e instanceof SfuError && e.status === 410) return;
      console.error("Closing the SFU tracks failed:", e);
    }
  }

  /** Tells a socket why it is over and closes it. */
  private dismiss(ws: WebSocket, seat: Seat, reason: OverReason) {
    ws.serializeAttachment({ ...seat, over: true });
    send(ws, { type: "over", reason });
    ws.close(1000);
  }

  /** Sets the alarm for whatever runs out first: a search or a conversation. */
  private async schedule() {
    const deadlines = [
      ...this.seats()
        .filter(({ seat }) => !seat.conversation)
        .map(({ seat }) => seat.since + SEARCH_MS),
      ...this.conversations().map(([, { endsAt }]) => endsAt),
    ];
    if (deadlines.length) {
      await this.ctx.storage.setAlarm(Math.min(...deadlines));
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  private async sfu<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/apps/${this.env.REALTIME_APP_ID}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.env.REALTIME_APP_SECRET}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    const result = (await response.json()) as T & {
      errorCode?: string;
      errorDescription?: string;
      tracks?: { errorCode?: string; errorDescription?: string }[];
    };
    const failed = result.errorCode
      ? result
      : result.tracks?.find((track) => track.errorCode);
    if (!response.ok || failed) {
      throw new SfuError(
        `${method} ${path}: ${response.status} ${failed?.errorCode ?? ""} ${failed?.errorDescription ?? ""}`,
        response.status,
      );
    }
    return result;
  }
}

class SfuError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Negotiation = { sessionDescription: { type: string; sdp: string } };

// Whether an offer carries one audio stream and nothing else. The SFU forwards
// whatever is published, so a client must not get to publish video.
function audioOnly(sdp: string) {
  const media = sdp.match(/^m=.*$/gm) ?? [];
  return media.length === 1 && media[0].startsWith("m=audio ");
}

function send(ws: WebSocket, message: ServerMessage) {
  try {
    ws.send(JSON.stringify(message));
  } catch {}
}
