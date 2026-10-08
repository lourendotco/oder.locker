import {
  CheckIcon,
  DeviceMobileIcon,
  MicrophoneStageIcon,
  SpeakerHighIcon,
  TelevisionIcon,
  WaveformIcon,
  type Icon,
  type IconWeight,
} from "@phosphor-icons/react";
import { useEffect, useRef } from "react";

type IntroProps = {
  open: boolean;
  onClose?: () => void;
};

// Set while "Do not show again" is ticked; the theme page's loader skips the
// dialog when it is there. Written from the page, so not HttpOnly: it only
// says whether to show this. SameSite=Lax as the session cookie, and for the
// same reason (see sessionHeaders).
export const HIDE_INTRO_COOKIE = "hide-intro";
const HIDE_INTRO_MAX_AGE = 60 * 60 * 24 * 365;

function rememberHidden(hidden: boolean) {
  const maxAge = hidden ? HIDE_INTRO_MAX_AGE : 0;
  document.cookie = `${HIDE_INTRO_COOKIE}=1; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`;
}

// The picture is one SVG, so it scales as a whole into the room the text
// leaves it, whatever the font size. Its unit is a hundredth of the circle's
// radius.
const RADIUS = 100;
// How far the icons' centres are from the circle's.
const ORBIT = 150;
const ICON_SIZE = 52;

// Clockwise around the circle, each at an angle in degrees from 3 o'clock.
const VOICES: {
  Icon: Icon;
  angle: number;
  rotate: number;
  flip?: "x" | "y";
  size?: number;
  weight?: IconWeight;
}[] = [
  { Icon: WaveformIcon, angle: 41, rotate: 177 },
  {
    Icon: MicrophoneStageIcon,
    angle: 90,
    rotate: 43,
    flip: "x",
    weight: "duotone",
  },
  { Icon: DeviceMobileIcon, angle: 149, rotate: -17 },
  { Icon: TelevisionIcon, angle: 219, rotate: 206, flip: "y", size: 56 },
  { Icon: SpeakerHighIcon, angle: 317, rotate: 318, flip: "x" },
];

function Voices() {
  return (
    // Decorative: the text around it says the same.
    <svg
      aria-hidden
      viewBox="-175 -140 350 330"
      className="min-h-[160px] w-full flex-1 text-neutral-500"
    >
      <defs>
        {/* As CSS's radial-gradient on a square: it ends at the corners,
            past the circle's edge. */}
        <radialGradient
          id="intro-circle"
          gradientUnits="userSpaceOnUse"
          cx={0}
          cy={0}
          r={RADIUS * Math.SQRT2}
        >
          <stop offset={0.55} stopColor="white" />
          <stop offset={1} style={{ stopColor: "var(--color-neutral-400)" }} />
        </radialGradient>
      </defs>
      <circle r={RADIUS} fill="url(#intro-circle)" />
      <text textAnchor="middle" dominantBaseline="central" fontSize={ICON_SIZE}>
        😌
      </text>
      {VOICES.map(({ Icon, angle, rotate, flip, size = ICON_SIZE, weight }) => {
        const radians = (angle * Math.PI) / 180;
        const x = (ORBIT * Math.cos(radians)).toFixed(1);
        const y = (ORBIT * Math.sin(radians)).toFixed(1);
        const scale = `${flip === "x" ? -1 : 1} ${flip === "y" ? -1 : 1}`;
        return (
          <g
            key={angle}
            transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}
          >
            <Icon x={-size / 2} y={-size / 2} size={size} weight={weight} />
          </g>
        );
      })}
    </svg>
  );
}

export default function Intro({ open, onClose }: IntroProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (open && !dialog.current?.open) {
      dialog.current?.showModal();
      // On the title rather than the first control, so a screen reader starts
      // reading there: VoiceOver doesn't read out a dialog's aria-describedby.
      // Nor is a key pressed by reflex then the checkbox's.
      title.current?.focus();
    } else if (!open && dialog.current?.open) {
      dialog.current.close();
    }
  }, [open]);

  return (
    // max-h-none drops the UA's max-height, which is in em and so would grow
    // the margins with the font size.
    <dialog
      ref={dialog}
      aria-label="How this works"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          event.currentTarget.close();
        }
      }}
      onClose={onClose}
      className="m-auto h-[calc(100%-18px)] max-h-none w-[calc(100%-18px)] max-w-sm flex-col overflow-y-auto overscroll-contain rounded-2xl border-0 bg-neutral-100 p-0 font-grotesk text-black shadow-xl transition-[opacity,scale] duration-200 ease-out backdrop:bg-black/40 open:flex motion-reduce:transition-opacity"
    >
      {/* The first sentence is the title: it names the dialog, and a heading
          is what VoiceOver can tell the focus is on (a focused <p> came out
          as "empty group"). Focusable from script only (see the effect
          above). No outline: it is a place to start reading from, not a
          control. */}
      <h2
        id="intro-title"
        ref={title}
        tabIndex={-1}
        className="px-4 pt-7 text-base font-light outline-none"
      >
        When a political topic is up for discussion, there are always many
        competing voices wanting to join in.
      </h2>
      <Voices />
      <p className="px-4 text-base font-light">
        Here you make your own conversation:
      </p>
      <p className="px-4 text-lg font-medium">
        You decide who you want to include.
      </p>
      {/* The button's name too, not only where it is. */}
      <p className="px-4 text-base font-light italic">
        The <span className="sr-only">“Add a voice”</span>{" "}button on the bottom
        right corner lets you add different voices to the debate.
      </p>
      <div className="mr-3 mb-5 mt-2 flex shrink-0 justify-between items-end pl-4">
        {/* The input inside the label is what ties them: no htmlFor. The
            padding gives it a tap target the size of the button's. */}
        <label className="-ml-2 flex min-h-11 items-center gap-1 px-2 text-sm">
          Do not show again
          <input
            type="checkbox"
            onChange={(event) => rememberHidden(event.target.checked)}
            className="size-4 accent-neutral-800"
          />
        </label>
        <button
          type="button"
          aria-label="Got it"
          onClick={() => dialog.current?.close()}
          className="ml-auto rounded-full bg-neutral-800 p-3 text-xl font-light text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          <CheckIcon aria-hidden weight="bold" />
        </button>
      </div>
    </dialog>
  );
}
