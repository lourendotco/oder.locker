import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";
import Header from "./Header";

/** The phone-shaped frame and header every page, including the error page, renders inside. */
export default function Shell({ children }: { children: ReactNode }) {
  const main = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const previous = useRef(pathname);

  // A client-side navigation leaves focus on the link that was followed, or
  // nowhere if that link is gone. Move it to the new page, unless the page
  // took it already (autoFocus).
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    if (!main.current?.contains(document.activeElement)) {
      main.current?.focus({ preventScroll: true });
    }
  }, [pathname]);

  return (
    <div className="font-space sm:flex sm:h-screen sm:w-screen sm:items-center sm:justify-center sm:py-5">
      {/* The frame and what scrolls inside it are two elements. The frame's
          drop-shadow is a filter, which makes it the containing block of
          every position: fixed element in it; were it the scroller as well,
          those would scroll away with the page. */}
      <div className="flex h-full min-h-screen max-w-sm flex-col bg-neutral-100 sm:aspect-9/16 sm:max-h-full sm:min-h-0 sm:w-auto sm:overflow-hidden sm:rounded-[2.5rem] sm:border-[0.5px] sm:drop-shadow-sm">
        <div className="flex flex-1 flex-col overflow-clip px-2.5 sm:min-h-0 sm:overflow-auto sm:scrollbar-none">
        {/* Focuses instead of following the fragment: the home page reads
            the URL's fragment as an email address. */}
        <a
          href="#main"
          onClick={(event) => {
            event.preventDefault();
            main.current?.focus();
          }}
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-black focus:shadow-md"
        >
          Skip to content
        </a>
        <Header />
        <main
          id="main"
          ref={main}
          tabIndex={-1}
          className="flex flex-1 flex-col outline-none"
        >
          {children}
        </main>
        </div>
      </div>
    </div>
  );
}
