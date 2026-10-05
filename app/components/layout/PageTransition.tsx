import { useState, ViewTransition, type ReactNode } from "react";
import { useNavigationType } from "react-router";

// Slides a route in from the right, on push navigations only. Back/forward
// (POP) are often native swipe gestures that already animate, so any extra
// transition doubles up.
export function PageTransition({ children }: { children: ReactNode }) {
  const navigationType = useNavigationType();
  // Decided once, on mount: switching wrappers later would remount the page.
  const [animate] = useState(navigationType !== "POP");

  // enter="none" is not enough for POP: React starts a document view
  // transition whenever a <ViewTransition> mounts, whatever its class, and the
  // frozen snapshot shows up as a flicker. So render no boundary at all.
  if (!animate) return children;

  return (
    <ViewTransition enter="slide-in-right" default="none">
      {children}
    </ViewTransition>
  );
}
