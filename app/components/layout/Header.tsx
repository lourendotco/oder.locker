import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router";
import { Avatar } from "./Avatar";
import { Logo } from "./Logo";
import { useUser } from "~/routes/layout";
import {
  ClockCounterClockwiseIcon,
} from "@phosphor-icons/react";

export default function Header({ step = 0 }) {
  const ref = useRef<HTMLElement>(null);
  const user = useUser();

  // Publishes the header's height as --header-height on the root element, so
  // pages can keep scroll targets clear of it.
  useLayoutEffect(() => {
    const header = ref.current;
    if (!header) return;
    const root = document.documentElement;
    const update = () =>
      root.style.setProperty("--header-height", `${header.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--header-height");
    };
  }, []);

  return (
    // Its own view-transition-name lifts the header out of the root snapshot,
    // which sits below every named group. Groups stack in paint order, so with
    // z-20 it stays above the page sliding in.
    <header
      ref={ref}
      className="sticky top-0 left-0 z-20 -mx-2.5 [view-transition-name:header] bg-linear-to-b from-neutral-100 from-80% to-transparent px-2.5 pt-2.5 pb-4"
    >
      {/* The avatar and the logo are sized in rem. With a large default font
          size the three no longer fit side by side, so the logo is the one
          that gives way (min-w-0 on its link, max-w-full on itself). */}
      <nav
        aria-label="Main"
        className="flex items-center justify-between gap-2"
      >
        {/* signed out: same-sized blanks on either side keep the logo centred */}
        {user ? (
          <Link to="/profile" aria-label="Your profile" className="shrink-0">
            <Avatar user={user} className="h-10 w-10 text-xl" />
          </Link>
        ) : (
          <span className="h-10 w-10 shrink-0" />
        )}
        <Link to="/" aria-label="oder, home" className="min-w-0">
          <Logo
            aria-hidden
            className="w-30 max-w-full drop-shadow-sm drop-shadow-white"
          />
        </Link>
        {user ? (
          <Link to="/weeks" aria-label="Previous weeks" className="shrink-0">
            <ClockCounterClockwiseIcon
              aria-hidden
              size={35}
              weight="bold"
              className="text-secondary"
            />
          </Link>
        ) : (
          <span className="h-10 w-10" />
        )}
      </nav>
    </header>
  );
}