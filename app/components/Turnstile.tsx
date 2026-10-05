import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  type Ref,
} from "react";

// Dummy always-passes key in dev: renders an invisible widget on localhost
// (paired with the dummy secret in .dev.vars).
const SITE_KEY = import.meta.env.PROD
  ? "0x4AAAAAAFNxJbxWyeDivkVl"
  : "1x00000000000000000000BB";

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: Record<string, unknown>): string;
      reset(id: string): void;
      remove(id: string): void;
      execute(el: HTMLElement): void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

let scriptReady: Promise<void> | undefined;

function loadTurnstile(): Promise<void> {
  scriptReady ??= new Promise((resolve) => {
    if (window.turnstile) return resolve();
    window.onloadTurnstileCallback = () => {
      delete window.onloadTurnstileCallback;
      resolve();
    };
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit";
    script.async = true;
    script.defer = true;

    document.head.appendChild(script);
  });
  return scriptReady;
}

export type TurnstileHandle = { execute: () => void };

/**
 * Renders inside a <form>: the widget injects a hidden cf-turnstile-response
 * input for the action to verify. Tokens are single-use — pass the fetcher
 * result as resetSignal so a new token is issued after each submission.
 *
 * With execution="execute" the challenge only runs when the handle's
 * execute() is called (intercept the form's onSubmit, preventDefault, execute,
 * then submit from onToken once the token lands).
 */
export default function Turnstile({
  onToken,
  resetSignal,
  className,
  execution,
  ref,
}: {
  onToken?: (token: string | null) => void;
  resetSignal?: unknown;
  className?: string;
  execution?: "execute";
  ref?: Ref<TurnstileHandle>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const emitToken = useEffectEvent((token: string | null) => onToken?.(token));

  useImperativeHandle(ref, () => ({
    execute() {
      if (widgetId.current) window.turnstile?.execute(containerRef.current!);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    emitToken(null);
    loadTurnstile().then(() => {
      if (cancelled || !containerRef.current) return;
      widgetId.current = window.turnstile!.render(containerRef.current, {
        sitekey: SITE_KEY,
        action: "turnstile-spin-v2",
        size: "flexible",
        execution,
        callback: (token: string) => emitToken(token),
        "expired-callback": () => emitToken(null),
      });
    });

    return () => {
      cancelled = true;
      if (widgetId.current) {
        window.turnstile?.remove(widgetId.current);
        widgetId.current = undefined;
      }
    };
  }, []);

  useEffect(() => {
    if (widgetId.current) {
      window.turnstile?.reset(widgetId.current);
      emitToken(null);
    }
  }, [resetSignal]);

  return <div ref={containerRef} className={className} />;
}
