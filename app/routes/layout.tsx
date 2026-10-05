import { useEffect } from "react";
import { Outlet, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/layout";
import Shell from "~/components/layout/Shell";
import { getUser } from "~/lib/session.server";

const PRELOADED_FONTS = [
  { family: "Antonio", href: "/Antonio-VariableFont_wght.ttf" },
  { family: "Grotesk", href: "/HankenGrotesk-VariableFont_wght.ttf" },
];

export const links: Route.LinksFunction = () =>
  PRELOADED_FONTS.map(({ href }) => ({
    rel: "preload",
    href,
    as: "font",
    type: "font/ttf",
    crossOrigin: "anonymous",
  }));

export function loader({ request }: Route.LoaderArgs) {
  return getUser(request);
}

/** The signed-in user, or null/undefined when signed out — callers gate on its truthiness. */
export function useUser() {
  return useRouteLoaderData<typeof loader>("routes/layout");
}

export default function Layout() {
  useEffect(() => {
    for (const { family } of PRELOADED_FONTS) {
      document.fonts.load(`1em "${family}"`).catch(() => {});
    }
  }, []);

  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
