import { useEffect, useRef } from "react";

export type Emoji = { id: string; native: string; shortcodes: string };

/**
 * Thin wrapper around emoji-mart's vanilla web component (@emoji-mart/react
 * doesn't support React 19). emoji-mart and its data are imported lazily, so
 * they stay out of the server render and the main bundle.
 */
export function EmojiPicker({
  onEmojiSelect,
  onClickOutside,
}: {
  onEmojiSelect: (emoji: Emoji) => void;
  onClickOutside?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The picker is created once; read the latest callbacks through a ref.
  const callbacks = useRef({ onEmojiSelect, onClickOutside });
  callbacks.current = { onEmojiSelect, onClickOutside };

  useEffect(() => {
    let picker: HTMLElement | undefined;
    let cancelled = false;
    import("emoji-mart").then(({ Picker, FrequentlyUsed }) => {
      if (cancelled || !ref.current) return;
      // Shown as "frequently used" until the user has picked something.
      FrequentlyUsed.DEFAULTS.splice(
        0,
        Infinity,
        "+1",
        "-1",
        "neutral_face",
        "shrug"
      );
      picker = new Picker({
        parent: ref.current,
        data: () => import("@emoji-mart/data").then((m) => m.default),
        i18n: () =>
          import("@emoji-mart/data/i18n/de.json").then((m) => m.default),
        locale: "de",
        autoFocus: true,
        previewPosition: "none",
        skinTonePosition: "search",
        onEmojiSelect: (emoji: Emoji) =>
          callbacks.current.onEmojiSelect(emoji),
        onClickOutside: () => callbacks.current.onClickOutside?.(),
      }) as unknown as HTMLElement;
      // Set on the element itself: these override the shadow DOM's `:host`
      // defaults, which would shadow anything inherited from a parent.
      // The search input uses `--font-size - 1px`; iOS zooms in on focus
      // below 16px.
      picker.style.setProperty("--font-size", "17px");
      // nav + search (91px) + sticky category label (32px) + 4 rows of 36px
      // emoji buttons, so it still fits above the iOS keyboard.
      picker.style.height = "267px";
    });
    return () => {
      cancelled = true;
      // Detaching triggers the element's disconnectedCallback, which removes
      // its document click listener.
      picker?.remove();
    };
  }, []);

  // The picker's own labels are German (see locale above).
  return <div ref={ref} lang="de" />;
}
