import { useEffect, useRef, useState } from "react";
import { atom, useAtomValue, useSetAtom } from "jotai";
import {
  MicrophoneIcon,
  MicrophoneSlashIcon,
  PhoneXIcon,
} from "@phosphor-icons/react";
import { useFeed, useFeedItem } from "./feed";
import { Avatar } from "~/components/layout/Avatar";
import {
  EXTEND_WINDOW_MS,
  SEARCH_MS,
  type ClientMessage,
  type OverReason,
  type ServerMessage,
} from "~/lib/discussion";
import { scrollToStart } from "~/lib/scroll";

const QUESTIONS = [
  "What voice do you want to discuss?",
  "If you haven’t yet read the text, read the text together aloud.",
  "Where does the author position themselves in the debate?",
  "What does it have to do with their own interests?",
  "Do you agree? Why?",
  "Did their point of view help you understand the debate?",
];

// "mic": the microphone was refused. "self": the user hung up.
type Over = OverReason | "mic" | "self";

const OVER_TEXT: Record<Over, string> = {
  none: "Sorry, currently there is no other user available to add to your conversation.",
  ended: "The conversation has ended.",
  left: "The other participant left the conversation.",
  self: "You left the conversation.",
  busy: "You are already looking for or in a conversation in another tab.",
  mic: "The microphone can’t be used. Allow access to it and try again.",
  error: "The connection was lost.",
};

type Conversation = Extract<ServerMessage, { type: "state" }>;

// Whether a discussion block has yet to run its course: there is only ever
// one of those on the feed.
const discussingAtom = atom(false);

/** For whatever starts a discussion: `start` adds a block to the feed,
    unless one is still `discussing`. */
export function useDiscussion() {
  const { append } = useFeed();
  const discussing = useAtomValue(discussingAtom);
  const setDiscussing = useSetAtom(discussingAtom);

  return {
    discussing,
    start: () => {
      if (discussing) return;
      setDiscussing(true);
      append(<Discussion key={`discussion-${Date.now()}`} />);
    },
  };
}

// Resolves once the connection has its network candidates, or after a second:
// the SFU is publicly reachable, so the rest can be found on the way.
function candidatesGathered(pc: RTCPeerConnection) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const timer = setTimeout(resolve, 1000);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState !== "complete") return;
      clearTimeout(timer);
      resolve();
    });
  });
}

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const round =
  "flex size-10 items-center justify-center rounded-full text-white transition-[scale] active:scale-95";

/** A block on the feed that finds another user who is also looking to
    discuss and holds a timed voice conversation with them (see
    workers/discussions.ts for the other end). */
function Discussion() {
  const { finish } = useFeedItem({ kind: "discussion" });
  const setDiscussing = useSetAtom(discussingAtom);

  const [phase, setPhase] = useState<"mic" | "searching" | "live">("mic");
  const [over, setOver] = useState<Over | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  // performance.now() at which the search or the conversation runs out.
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(() => performance.now());
  const [muted, setMuted] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  // What the others are saying, one stream per participant.
  const [voices, setVoices] = useState<MediaStream[]>([]);

  const root = useRef<HTMLElement>(null);
  const microphone = useRef<MediaStream>(null);
  const hangUp = useRef<() => void>(null);
  const extend = useRef<() => void>(null);

  // It can take ten minutes: the blocks after it don't wait.
  useEffect(() => finish(), []);

  // Focus comes along: the button that started the discussion is disabled
  // by now, or was in a dialog that has closed.
  useEffect(() => {
    scrollToStart(root.current);
    root.current?.focus({ preventScroll: true });
  }, []);

  // A button that had focus is gone with the step it belonged to ("stop
  // looking", "Leave the conversation"): keep focus on the block.
  useEffect(() => {
    if (document.activeElement === document.body) {
      root.current?.focus({ preventScroll: true });
    }
  }, [phase, over]);

  useEffect(() => {
    let gone = false;
    let ws: WebSocket | undefined;
    let pc: RTCPeerConnection | undefined;
    let stream: MediaStream | undefined;
    // Publishing has started / the connection to the SFU is up.
    let publishing = false;
    let connected = false;
    // A pull is awaiting its offer or the server's "ready": one at a time.
    let pulling = false;
    // Whose microphones have been asked for, and who is there to ask.
    const pulled = new Set<number>();
    let latest: Conversation | undefined;

    setDiscussing(true);

    const release = () => {
      gone = true;
      ws?.close();
      pc?.close();
      stream?.getTracks().forEach((track) => track.stop());
    };
    const end = (reason: Over) => {
      if (gone) return;
      release();
      setOver(reason);
      setVoices([]);
      setDiscussing(false);
    };
    hangUp.current = () => end("self");

    const say = (message: ClientMessage) => ws?.send(JSON.stringify(message));
    extend.current = () => say({ type: "extend" });

    const publish = async () => {
      publishing = true;
      pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
        bundlePolicy: "max-bundle",
      });
      pc.addEventListener("track", ({ track }) =>
        setVoices((voices) => [...voices, new MediaStream([track])]),
      );
      // Only now can the others pull this microphone, and this end pull
      // theirs: the SFU refuses both on a connection that isn't up.
      pc.addEventListener("connectionstatechange", () => {
        if (pc?.connectionState === "failed") setAudioFailed(true);
        if (pc?.connectionState !== "connected" || connected) return;
        connected = true;
        say({ type: "connected" });
        pull();
      });
      const transceiver = pc.addTransceiver(stream!.getAudioTracks()[0], {
        direction: "sendonly",
      });
      await pc.setLocalDescription(await pc.createOffer());
      await candidatesGathered(pc);
      if (gone) return;
      say({
        type: "publish",
        sdp: pc.localDescription!.sdp,
        mid: transceiver.mid!,
      });
    };

    // can i do all of this server side?
    // Asks for the microphones that have come up since the last time.
    const pull = () => {
      if (!connected || pulling || !latest) return;
      const ids = latest.participants
        .filter(({ id, live }) => live && id !== latest!.you && !pulled.has(id))
        .map(({ id }) => id);
      if (!ids.length) return;
      pulling = true;
      ids.forEach((id) => pulled.add(id));
      say({ type: "pull", ids });
    };

    const receive = async (message: ServerMessage) => {
      if (message.type === "waiting") {
        setPhase("searching");
        setDeadline(performance.now() + message.remaining);
      } else if (message.type === "state") {
        latest = message;
        setPhase("live");
        setConversation(message);
        setDeadline(performance.now() + message.remaining);
        if (!publishing) await publish();
        pull();
      } else if (message.type === "published") {
        await pc!.setRemoteDescription({ type: "answer", sdp: message.sdp });
      } else if (message.type === "offer") {
        await pc!.setRemoteDescription({ type: "offer", sdp: message.sdp });
        await pc!.setLocalDescription(await pc!.createAnswer());
        say({ type: "answer", sdp: pc!.localDescription!.sdp });
      } else if (message.type === "ready") {
        pulling = false;
        pull();
      } else if (message.type === "audio-failed") {
        setAudioFailed(true);
      } else if (message.type === "over") {
        end(message.reason);
      }
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        return end("mic");
      }
      if (gone) return stream.getTracks().forEach((track) => track.stop());
      microphone.current = stream;

      ws = new WebSocket(
        `${import.meta.env.PROD ? "wss" : "ws"}://${location.host}/discuss`,
      );
      // One at a time, in the order they came: the SDP exchanges are async.
      let queue = Promise.resolve();
      ws.addEventListener("message", ({ data }) => {
        queue = queue
          .then(() => (gone ? undefined : receive(JSON.parse(data))))
          .catch((e) => {
            console.error(e);
            setAudioFailed(true);
          });
      });
      // After whatever is still queued, which may be the reason it closed.
      ws.addEventListener("close", () => queue.then(() => end("error")));
      setPhase("searching");
      setDeadline(performance.now() + SEARCH_MS);
    })();

    return () => {
      release();
      setDiscussing(false);
    };
  }, []);

  const running = !over && phase !== "mic";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [running]);

  // Escape calls the search off, wherever focus is. Not a conversation:
  // that takes its button. And not from under a dialog, which the same
  // key closes.
  const searching = !over && phase === "searching";
  useEffect(() => {
    if (!searching) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("dialog:modal")) return;
      hangUp.current?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [searching]);

  const remaining = deadline - now;
  const others = conversation?.participants.filter(
    ({ id }) => id !== conversation.you,
  );
  const canExtend =
    !!conversation && !conversation.maxed && remaining <= EXTEND_WINDOW_MS;
  const agreed = !!conversation?.votes.includes(conversation.you);
  const askedBy = others?.filter(({ id }) => conversation!.votes.includes(id));

  return (
    <section
      ref={root}
      aria-label="Discussion"
      tabIndex={-1}
      className="-mr-[30px] scroll-mt-(--header-height) rounded-xl bg-white p-3 font-grotesk text-sm leading-[1.3] text-black shadow-md"
    >
      {over ? (
        <p role="status" className="text-center text-gray-700">
          {OVER_TEXT[over]}
        </p>
      ) : phase === "live" && conversation ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {others?.map((user) => (
                <Avatar
                  key={user.id}
                  user={user}
                  className="size-9 text-lg ring-2 ring-white"
                />
              ))}
            </div>
            <p className="min-w-0 flex-1 truncate font-medium">
              {others?.map(({ name, username }) => name ?? username).join(", ")}
            </p>
            <p
              role="timer"
              className={`font-space text-lg font-medium tabular-nums ${remaining <= EXTEND_WINDOW_MS ? "text-primary" : "text-secondary"}`}
            >
              <span className="sr-only">Time left: </span>
              {clock(remaining)}
            </p>
          </div>
          {audioFailed && (
            <p role="alert" className="text-red-600">
              The audio couldn’t connect.
            </p>
          )}
          <ul className="flex flex-col gap-1.5 text-gray-700">
            {QUESTIONS.map((question) => (
              <li key={question} className="border-l-2 border-tertiary pl-2">
                {question}
              </li>
            ))}
          </ul>
          {canExtend && (
            <div
              role="status"
              className="pop-in flex items-center gap-2 rounded-lg bg-tertiary/20 p-2"
            >
              <p className="min-w-0 flex-1">
                {agreed
                  ? "Waiting for the others to agree…"
                  : askedBy?.length
                    ? `${askedBy.map(({ name, username }) => name ?? username).join(", ")} would like one more minute.`
                    : "Almost out of time. One more minute?"}
              </p>
              {!agreed && (
                <button
                  type="button"
                  onClick={() => {
                    // Shown as agreed right away; the server's next state
                    // confirms it.
                    setConversation({
                      ...conversation,
                      votes: [...conversation.votes, conversation.you],
                    });
                    extend.current?.();
                    // The button goes away: don't let focus go with it.
                    root.current?.focus({ preventScroll: true });
                  }}
                  className="shrink-0 rounded-full bg-primary px-3 py-1 font-medium text-white transition-[scale] active:scale-95"
                >
                  Extend
                </button>
              )}
            </div>
          )}
          <div className="flex justify-center gap-4">
            <button
              type="button"
              // The name stays put and aria-pressed carries the state: a
              // name that flips as well reads as "Unmute, pressed".
              aria-label="Mute microphone"
              aria-pressed={muted}
              onClick={() => {
                const track = microphone.current?.getAudioTracks()[0];
                if (track) track.enabled = muted;
                setMuted(!muted);
              }}
              className={`${round} ${muted ? "bg-gray-400" : "bg-secondary"}`}
            >
              {muted ? (
                <MicrophoneSlashIcon aria-hidden size={22} weight="fill" />
              ) : (
                <MicrophoneIcon aria-hidden size={22} weight="fill" />
              )}
            </button>
            <button
              type="button"
              aria-label="Leave the conversation"
              onClick={() => hangUp.current?.()}
              className={`${round} bg-red-600`}
            >
              <PhoneXIcon aria-hidden size={22} weight="fill" />
            </button>
          </div>
          {voices.map((voice) => (
            <audio
              key={voice.id}
              autoPlay
              ref={(audio) => {
                if (audio && audio.srcObject !== voice) audio.srcObject = voice;
              }}
            />
          ))}
        </div>
      ) : (
        <div role="status" className="flex flex-col items-center gap-3 py-2">
          <div className="relative flex size-12 items-center justify-center">
            {phase === "searching" && (
              <>
                <span className="discussion-ring absolute inset-0 rounded-full bg-secondary" />
                <span className="discussion-ring absolute inset-0 rounded-full bg-secondary" />
              </>
            )}
            <span className="relative flex size-12 items-center justify-center rounded-full bg-secondary text-white">
              <MicrophoneIcon aria-hidden size={26} weight="fill" />
            </span>
          </div>
          <p className="text-center text-gray-700">
            {phase === "mic"
              ? "Allow the microphone to start discussing."
              : "Looking for someone to discuss with…"}
          </p>
          {phase === "searching" && (
            <>
              <div
                aria-hidden
                className="h-1 w-full overflow-hidden rounded-full bg-neutral-200"
              >
                <div
                  className="h-full origin-left bg-secondary transition-[scale] duration-250 ease-linear"
                  style={{
                    scale: `${Math.min(1, Math.max(0, 1 - remaining / SEARCH_MS))} 1`,
                  }}
                />
              </div>
              <button
                type="button"
                aria-keyshortcuts="Escape"
                onClick={() => hangUp.current?.()}
                className="cursor-pointer text-xs underline underline-offset-4"
              >
                stop looking
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
