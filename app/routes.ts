import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("routes/layout.tsx", [
    index("routes/home.tsx"),
    route("theme", "routes/theme.tsx"),
    route("profile", "routes/profile.tsx"),
    route("weeks", "routes/weeks.tsx"),
    route("privacy", "routes/privacy.tsx"),
  ]),
  route("logout", "routes/logout.tsx"),] satisfies RouteConfig;
