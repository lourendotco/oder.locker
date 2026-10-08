import { useEffect, useRef, useState } from "react";
import { atom, useAtomValue, useSetAtom } from "jotai";
import {
  MicrophoneIcon,
  MicrophoneSlashIcon,
  PhoneXIcon,
} from "@phosphor-icons/react";
import { useFeed, useFeedItem } from "./feed";
import HoppingMap from "./HoppingMap";
import { useDiscussionAudio, useMicrophone } from "./hooks/audioHooks";
import { useDiscussionSocket } from "./hooks/useDiscussionSocket";
import { QuestionTicker } from "./QuestionTicker";
import { Avatar } from "~/components/layout/Avatar";
import { EXTEND_WINDOW_MS, SEARCH_MS, type OverReason } from "~/lib/discussion";
import { scrollToStart } from "~/lib/scroll";
import { countAtom, useOnlineCount } from "./hooks/useOnlineCount";

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

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const round =
  "flex size-10 items-center justify-center rounded-full text-white transition-[scale] active:scale-95";

// The block's frame. Once it is over, it shrinks to a note.
const NOTE = "rounded-xl p-3 shadow-md";
const WIDGET =
  "aspect-4/3 rounded-[2.5rem] border-8 border-white drop-shadow-md";
// 4:3 is where a conversation starts from: unclipped, it grows with what
// is in it. The map is clipped to it.
const FRAME = {
  live: `${WIDGET} p-3`,
  map: `${WIDGET} relative overflow-clip`,
};

/** A block on the feed that finds another user who is also looking to
    discuss and holds a timed voice conversation with them (see
    workers/discussions.ts for the other end). */
function Discussion() {
  const { finish } = useFeedItem({ kind: "discussion" });
  const setDiscussing = useSetAtom(discussingAtom);
  const online = useAtomValue(countAtom);
  // The socket waits for the microphone, the audio needs both.
  const microphone = useMicrophone();
  const socket = useDiscussionSocket(!!microphone.stream);
  const audio = useDiscussionAudio(microphone.stream, socket);

  const { conversation } = socket;
  const over: Over | null = microphone.refused ? "mic" : socket.over;
  const phase = !microphone.stream
    ? "mic"
    : conversation
      ? "live"
      : "searching";

  const [now, setNow] = useState(() => performance.now());
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    setDiscussing(!over);
    return () => setDiscussing(false);
  }, [over]);

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
      socket.leave();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [searching]);

  const remaining = socket.deadline - now;
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
      className="-mr-[30px] scroll-mt-(--header-height) font-grotesk text-sm leading-[1.3] text-black outline-none"
    >
      {!over && phase !== "live" && (
        <>
          <div
            role="status"
            className="my-3 mx-3.5 flex items-stretch gap-2 pr-0.5"
          >
            <p className="relative isolate grow overflow-hidden rounded-lg bg-white px-3 text-center text-base shadow-md">
              {phase === "mic" ? (
                "Allow the microphone to start discussing."
              ) : (
                <>
                  Waiting for a conversation partner
                  <span aria-hidden>
                    <span className="waiting-dot">.</span>
                    <span className="waiting-dot">.</span>
                    <span className="waiting-dot">.</span>
                  </span>
                </>
              )}
              {phase === "searching" && (
                <span
                  aria-hidden
                  className="absolute inset-0 -z-10 origin-left bg-neutral-200 transition-[scale] duration-250 ease-linear"
                  style={{
                    scale: `${Math.min(1, Math.max(0, 1 - remaining / SEARCH_MS))} 1`,
                  }}
                />
              )}
            </p>
            {phase === "searching" && (
              <button
                type="button"
                aria-keyshortcuts="Escape"
                aria-label="Stop looking"
                onClick={socket.leave}
                className="size-6 shrink-0 cursor-pointer rounded-xs bg-red-600 shadow-md"
              />
            )}
          </div>
        </>
      )}
      <div
        className={`bg-white ${over ? NOTE : FRAME[phase === "live" ? "live" : "map"]}`}
      >
        {over ? (
          <p role="status" className="text-center text-gray-700">
            {OVER_TEXT[over]}
          </p>
        ) : phase === "live" && conversation ? (
          <div className="relative flex flex-col gap-3">
            <p
              role="timer"
              className={`absolute top-0 right-2 font-space text-lg font-medium tabular-nums ${remaining <= EXTEND_WINDOW_MS ? "text-primary" : "text-secondary"}`}
            >
              <span className="sr-only">Time left: </span>
              {clock(remaining)}
            </p>
            <div className="flex justify-center gap-4">
              {others?.map((user) => (
                <div
                  key={user.id}
                  className="flex min-w-0 flex-col items-center"
                >
                  <Avatar user={user} className="mb-1 size-16 text-3xl" />
                  <p className="max-w-full truncate font-medium">
                    {user.name ?? user.username}
                  </p>
                  {user.name && (
                    <p className="max-w-full truncate text-gray-500">
                      {user.username}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {audio.failed && (
              <p role="alert" className="text-red-600">
                The audio couldn’t connect.
              </p>
            )}
            <QuestionTicker questions={QUESTIONS} />
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
                      socket.extend();
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
                aria-pressed={audio.muted}
                onClick={audio.toggleMute}
                className={`${round} ${audio.muted ? "bg-gray-400" : "bg-secondary"}`}
              >
                {audio.muted ? (
                  <MicrophoneSlashIcon aria-hidden size={22} weight="fill" />
                ) : (
                  <MicrophoneIcon aria-hidden size={22} weight="fill" />
                )}
              </button>
              <button
                type="button"
                aria-label="Leave the conversation"
                onClick={socket.leave}
                className={`${round} bg-red-600`}
              >
                <PhoneXIcon aria-hidden size={22} weight="fill" />
              </button>
            </div>
            {audio.voices.map((voice) => (
              <audio
                key={voice.id}
                autoPlay
                ref={(audio) => {
                  if (audio && audio.srcObject !== voice)
                    audio.srcObject = voice;
                }}
              />
            ))}
          </div>
        ) : (
          <HoppingMap />
        )}
      </div>
      {!over && phase === "searching" && online !== null && (
        <p className="mt-1 pl-2 text-sm text-gray-700">
          {online === 1
            ? "There is no one else on this page right now."
            : `There ${online - 1 > 1 ? "are" : "is"} ${online - 1} other user${online - 1 > 1 ? "s" : ""} on this page.`}
        </p>
      )}
    </section>
  );
}
