// What the discussion widget (app/components/chat/Discussion.tsx) and the
// Discussions Durable Object (workers/discussions.ts) say to each other over
// the /discuss WebSocket. Durations are milliseconds.

/** How long the widget looks for someone before giving up. */
export const SEARCH_MS = 60_000;
/** A conversation's length before any extension. */
export const CONVERSATION_MS = 3 * 60_000;
/** What one extension adds. */
export const EXTENSION_MS = 60_000;
/** The longest a conversation gets, extensions included. */
export const MAX_CONVERSATION_MS = 10 * 60_000;
/** The stretch at the end in which an extension can be agreed on. */
export const EXTEND_WINDOW_MS = 30_000;
/** How young a two-person conversation has to be to take a third. */
export const JOIN_WINDOW_MS = 30_000;

export type Participant = {
  id: number;
  username: string;
  name: string | null;
  photoKey: string | null;
};

/** Why a widget is over. "none": nobody was found. "left": the others left.
    "busy": this account is already searching or talking elsewhere. */
export type OverReason = "none" | "ended" | "left" | "busy" | "error";

export type ServerMessage =
  | { type: "waiting"; remaining: number }
  | {
      type: "state";
      you: number;
      /** `live`: their microphone reaches the SFU and can be pulled. */
      participants: (Participant & { live: boolean })[];
      remaining: number;
      /** No extension is left to ask for. */
      maxed: boolean;
      /** Who has agreed to the extension on offer. */
      votes: number[];
    }
  /** The SFU's answer to `publish`. */
  | { type: "published"; sdp: string }
  /** The SFU's offer after `pull`; it wants an `answer`. */
  | { type: "offer"; sdp: string }
  /** The `answer` is in: the next `pull` can go. */
  | { type: "ready" }
  /** The conversation goes on, but this participant's audio does not work. */
  | { type: "audio-failed" }
  | { type: "over"; reason: OverReason };

export type ClientMessage =
  /** The offer sending the microphone, and the mid it is on. */
  | { type: "publish"; sdp: string; mid: string }
  /** The connection to the SFU is up: the microphone is arriving there. The
      SFU refuses a pull of a track it isn't receiving yet. */
  | { type: "connected" }
  /** Asks for the microphones of these participants. */
  | { type: "pull"; ids: number[] }
  | { type: "answer"; sdp: string }
  /** Agrees to the extension on offer. */
  | { type: "extend" };
