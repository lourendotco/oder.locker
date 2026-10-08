import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FilePdfIcon, ReadCvLogoIcon } from "@phosphor-icons/react";
import { EmojiPicker } from "./EmojiPicker";

// The spring the emojis pop in on.
const SPRING =
  "linear(0, 0.03 1.6%, 0.121 3.4%, 0.646 10.4%, 0.851 13.8%, 0.992 17.4%, 1.036 19.3%, 1.064 21.3%, 1.078 23.6%, 1.077 26.3%, 1.013 38.2%, 0.995 46%, 1)";
const EMOJIS_DURATION = 1500;

export function ChatBubble({
  author,
  lastInGroup,
  typing,
  onTyped,
  emojis,
  onReact,
  bleed,
  citation,
  children,
}: {
  /** The name, if any, is shown above the content, in `color` (any CSS
      color). `lang` is the name's language, when it is not English. */
  author?: { name?: string; lang?: string; avatar: ReactNode; color?: string };
  /** Last of consecutive bubbles by the same author: shows the author's
      avatar and the bubble's tail. */
  lastInGroup?: boolean;
  /** Shows typing dots in place of the content and the emojis. */
  typing?: boolean;
  /** Called when `typing` has turned false and the content is laid out. */
  onTyped?: () => void;
  emojis?: string[];
  /** Called with the native emoji picked from the emoji drawer's picker. */
  onReact?: (emoji: string) => void;
  /** Content (e.g. a picture) fills the bubble edge to edge. */
  bleed?: boolean;
  /** Source of the quote, linked below the bubble. `type` picks the icon
      and defaults to "article". `lang` is the title's language, when it is
      not the page's. */
  citation?: {
    href: string;
    title: ReactNode;
    type?: "article" | "pdf";
    lang?: string;
  };
  children: ReactNode;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const avatar = lastInGroup && author?.avatar;
  // The emojis only show once the bubble is typed out.
  const hasEmojis = !typing && !!emojis?.length;
  const emojisRef = useRef<HTMLButtonElement>(null);
  // Whether the bubble has been showing typing dots.
  const wasTyping = useRef(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  // How wide the bubble was with the typing dots in it.
  const typingWidth = useRef(0);

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (typing) {
      wasTyping.current = true;
      // The layout width: unlike the bounding box, .bubble-pop-in doesn't
      // scale it.
      typingWidth.current = bubble?.offsetWidth ?? 0;
      return;
    }
    if (!wasTyping.current) return;
    wasTyping.current = false;

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      emojisRef.current?.animate({ opacity: [0, 1] }, { duration: 200 });
    } else {
      // The text grows out of the dots: .bubble-pop-in again, from the size
      // the bubble had, on the curve and duration app.css gives that class.
      if (bubble?.offsetWidth) {
        const { animationDuration, animationTimingFunction } =
          getComputedStyle(bubble);
        bubble.animate(
          { scale: [typingWidth.current / bubble.offsetWidth, 1] },
          {
            duration: parseFloat(animationDuration) * 1000,
            easing: animationTimingFunction,
          },
        );
      }
      emojisRef.current?.animate(
        { scale: [0.4, 1], opacity: [0, 1] },
        { duration: EMOJIS_DURATION, easing: SPRING },
      );
    }
    onTyped?.();
  }, [typing]);

  return (
    <>
      {/* The avatar, its gap and the tail are sized in px, not rem: a larger
          default font size should go to the text, not to the gutter. */}
      <div
        className={`relative flex items-end gap-[8px] ${hasEmojis ? "pb-3" : ""}`}
      >
        {/* A box-shadow with drop-shadow-md's values, not the filter: on an
            element that also clips its overflow, the filter's shadow gets
            cut off at random as the chat repaints. */}
        {avatar && (
          <div className="flex size-[26px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_3px_3px_rgb(0_0_0/0.12)]">
            {avatar}
          </div>
        )}
        {/* The drop-shadow lives on a wrapper whose own box reaches down past
            the overhanging emojis (pb-3.5, cancelled by -mb-3.5 so layout is
            unchanged). WebKit sizes the filter region from the filtered
            element's box, so anything hanging outside it loses its shadow.
            min-w-0 lets it get narrower than its longest word, which then
            breaks instead of pushing the bubble off the screen. */}
        <div
          ref={bubbleRef}
          className={`bubble-pop-in min-w-0 drop-shadow-md ${avatar ? "" : "ml-[34px]"} ${hasEmojis ? "-mb-3.5 pb-3.5" : ""}`}
        >
          <div
            className={`relative rounded-xl bg-white text-black! ${bleed ? "" : `px-2.5 pt-1.5 ${hasEmojis ? "pb-4" : "pb-2"}`} text-sm text-white`}
          >
            {avatar && (
              <svg
                viewBox="-6 -24 30 24"
                aria-hidden
                className="absolute bottom-0 -left-[6px] h-[24px] w-[30px] fill-white"
              >
                <path d="M0-24V-11C0-7.5-3.5-3.5-5.5-1Q-6.2 0-5 0C-2 0 3-3.5 7.5-3.5C11-3.5 12.5-.5 15 0H24V-1A23 23 0 0 1 1-24Z" />
              </svg>
            )}
            {/* rounded-[inherit] + overflow-hidden clips bled content to the
                bubble's corners without clipping the tail or the emojis. */}
            <div
              className={`font-grotesk leading-[1.3] text-base wrap-break-word hyphens-auto ${bleed ? "overflow-hidden rounded-[inherit]" : ""}`}
            >
              {typing ? (
                // Real text, not a label: it is what a screen reader reads
                // where the bubble has yet to be typed out.
                <p className="flex h-[1.2em] items-center gap-1">
                  {/* English, said so for a bubble inside another language
                      (see Voice); the name in its own. */}
                  <span lang="en" className="sr-only">
                    {author?.name ? (
                      <>
                        <span lang={author.lang}>{author.name}</span> is
                        typing…
                      </>
                    ) : (
                      "Typing…"
                    )}
                  </span>
                  <span
                    aria-hidden
                    className="typing-dot size-1.5 rounded-full bg-neutral-400"
                  />
                  <span
                    aria-hidden
                    className="typing-dot size-1.5 rounded-full bg-neutral-400"
                  />
                  <span
                    aria-hidden
                    className="typing-dot size-1.5 rounded-full bg-neutral-400"
                  />
                </p>
              ) : (
                <>
                  {author?.name && (
                    <p
                      lang={author.lang}
                      className="pb-1 font-medium text-green-200"
                      style={{ color: author.color }}
                    >
                      {author.name}
                    </p>
                  )}
                  {children}
                </>
              )}
            </div>
            {/* After the content in the DOM, so a screen reader gets to the
                reactions once it has read what they react to; absolute, so
                it still shows at the bottom corner. */}
            {hasEmojis ? (
              <button
                ref={emojisRef}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
                lang="en"
                onClick={() => setPickerOpen((open) => !open)}
                className="absolute right-1 bottom-0 flex translate-y-1/2 gap-1.5 rounded-full bg-white px-2 py-0.5 text-base transition-[scale] active:scale-105 border-t-[0.5px] border-neutral-200"
              >
                <span className="sr-only">Reactions:</span>
                {emojis?.map((emoji) => (
                  <span key={emoji}>{emoji}</span>
                ))}
                <span className="sr-only">. Add a reaction</span>
              </button>
            ) : null}
          </div>
        </div>
        {/* Outside the bubble so its drop-shadow filter doesn't apply to, or
            trap the stacking of, the picker. */}
      </div>
      {/* The English words go before the link, not in it: VoiceOver read the
          link out by its name all in English, the lang inside it lost.
          With only the title in it, the link itself carries the title's lang.
          sr-only is absolute, so it takes no gap in the column. */}
      {citation && !typing && (
        <span lang="en" className="sr-only">
          {citation.type === "pdf"
            ? "Source (PDF, opens in a new tab): "
            : "Source (opens in a new tab): "}
        </span>
      )}
      {citation && !typing && (
        <a
          href={citation.href}
          lang={citation.lang}
          rel="noopener noreferrer"
          target="_blank"
          className="mt-1 -mr-1 mb-2 line-clamp-2 pl-2 text-xs text-blue-600 underline"
        >
          {citation.type === "pdf" ? (
            <FilePdfIcon
              aria-hidden
              className="mr-1 -skew-x-10 inline text-sm text-black"
            />
          ) : (
            <ReadCvLogoIcon
              aria-hidden
              className="mr-0.5 inline -translate-y-px text-sm text-black"
            />
          )}
          <cite className="not-italic">{citation.title}</cite>
        </a>
      )}
      {pickerOpen && (
        <div
          role="dialog"
          aria-label="Pick an emoji"
          // Focus moves into it; the live region the bubble may sit in
          // doesn't need to read it out as well.
          aria-live="off"
          // emoji-mart has no way out by keyboard of its own. On capture: it
          // stops its key events from bubbling.
          onKeyDownCapture={(event) => {
            if (event.key !== "Escape") return;
            setPickerOpen(false);
            emojisRef.current?.focus();
          }}
          className="absolute z-10 top-1/2 left-1/2 -translate-1/2"
        >
          <EmojiPicker
            onEmojiSelect={(emoji) => {
              onReact?.(emoji.native);
              setPickerOpen(false);
              emojisRef.current?.focus();
            }}
            onClickOutside={() => setPickerOpen(false)}
          />
        </div>
      )}
    </>
  );
}
