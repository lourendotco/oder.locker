import { atom, useSetAtom } from "jotai";
import { useEffect, useState } from "react";

// The wait before the first retry, doubled for each one after it, up to the
// cap.
const RETRY_MS = 1_000;
const RETRY_CAP_MS = 30_000;

export const countAtom = atom<number | null>(null);

/** The /online WebSocket (see workers/counter.ts for the other end): how
    many clients have it open right now, this one included. Connected for as
    long as the component is mounted, and reconnects by itself when the
    connection drops. null whenever there is no count to trust: before the
    first one arrives and while reconnecting. */
export function useOnlineCount() {
  const setCount = useSetAtom(countAtom);

  useEffect(() => {
    let gone = false;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Failed attempts since the last count that came through.
    let failures = 0;

    const connect = () => {
      clearTimeout(timer);
      timer = undefined;
      const next = new WebSocket(
        `${import.meta.env.PROD ? "wss" : "ws"}://${location.host}/online`,
      );
      socket = next;

      next.addEventListener("message", ({ data }) => {
        if (socket !== next) return;
        // A count, not just an open socket, is what proves the connection
        // works: one that opens and drops right away keeps backing off.
        failures = 0;
        setCount(Number(data));
      });
      // Also how a failed attempt ends: no need to listen for "error".
      next.addEventListener("close", () => {
        if (socket !== next) return;
        socket = null;
        setCount(null);
        // Offline: the "online" event below picks it back up.
        if (!navigator.onLine) return;
        const wait = Math.min(RETRY_CAP_MS, RETRY_MS * 2 ** failures++);
        // Half of it random, so that the clients a deploy drops all at once
        // don't come back all at once.
        timer = setTimeout(connect, wait / 2 + Math.random() * (wait / 2));
      });
    };

    // The network is back, or the tab is looked at again: no point sitting
    // out the rest of a long wait.
    const hurry = () => {
      if (gone || socket || document.visibilityState === "hidden") return;
      failures = 0;
      connect();
    };
    window.addEventListener("online", hurry);
    document.addEventListener("visibilitychange", hurry);

    connect();

    return () => {
      gone = true;
      clearTimeout(timer);
      window.removeEventListener("online", hurry);
      document.removeEventListener("visibilitychange", hurry);
      // Our own close is not news: `socket !== next` mutes its listeners.
      const last = socket;
      socket = null;
      last?.close();
    };
  }, []);

  return;
}
