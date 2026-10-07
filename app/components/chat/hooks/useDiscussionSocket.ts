import { useEffect, useRef, useState } from "react";
import {
  SEARCH_MS,
  type ClientMessage,
  type OverReason,
  type ServerMessage,
} from "~/lib/discussion";

export type Conversation = Extract<ServerMessage, { type: "state" }>;

type Handler = (message: ServerMessage) => void | Promise<void>;

export type DiscussionSocket = ReturnType<typeof useDiscussionSocket>;

/** The /discuss WebSocket (see workers/discussions.ts for the other end):
    the search, the conversation it finds and how it ends. Connects once
    `open` is true. */
export function useDiscussionSocket(open: boolean) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  // performance.now() at which the search or the conversation runs out.
  const [deadline, setDeadline] = useState(0);
  // "self": the user hung up.
  const [over, setOver] = useState<OverReason | "self" | null>(null);

  const ws = useRef<WebSocket>(null);
  const end = useRef<(reason: OverReason | "self") => void>(null);
  const handler = useRef<Handler>(null);

  useEffect(() => {
    if (!open) return;
    let gone = false;
    const socket = new WebSocket(
      `${import.meta.env.PROD ? "wss" : "ws"}://${location.host}/discuss`,
    );
    ws.current = socket;

    end.current = (reason) => {
      if (gone) return;
      gone = true;
      socket.close();
      setOver(reason);
    };

    const receive = async (message: ServerMessage) => {
      if (message.type === "over") return end.current?.(message.reason);
      if (message.type === "waiting") {
        setDeadline(performance.now() + message.remaining);
      } else if (message.type === "state") {
        setConversation(message);
        setDeadline(performance.now() + message.remaining);
      }
      await handler.current?.(message);
    };

    // One at a time, in the order they came: the SDP exchanges are async.
    let queue = Promise.resolve();
    socket.addEventListener("message", ({ data }) => {
      queue = queue
        .then(() => (gone ? undefined : receive(JSON.parse(data))))
        .catch(console.error);
    });
    // After whatever is still queued, which may be the reason it closed.
    socket.addEventListener("close", () =>
      queue.then(() => end.current?.("error")),
    );
    setDeadline(performance.now() + SEARCH_MS);

    return () => {
      gone = true;
      socket.close();
    };
  }, [open]);

  const send = (message: ClientMessage) =>
    ws.current?.send(JSON.stringify(message));

  return {
    conversation,
    deadline,
    over,
    send,
    /** Takes each message once this hook is through with it. The next one
        waits for what `handler` returns. */
    subscribe: (next: Handler) => {
      handler.current = next;
      return () => {
        if (handler.current === next) handler.current = null;
      };
    },
    /** Agrees to the extension on offer. */
    extend: () => {
      // Shown as agreed right away; the server's next state confirms it.
      setConversation(
        (conversation) =>
          conversation && {
            ...conversation,
            votes: [...conversation.votes, conversation.you],
          },
      );
      send({ type: "extend" });
    },
    leave: () => end.current?.("self"),
  };
}
