/** Scrolls an element to the top of the view: smoothly, unless the user has
    asked for reduced motion. `behavior: "smooth"` passed from script ignores
    that preference on its own. */
export function scrollToStart(element: Element | null | undefined) {
  element?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
}
