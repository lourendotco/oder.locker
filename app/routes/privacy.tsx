import type { Route } from "./+types/privacy";

export function meta({}: Route.MetaArgs) {
  return [{ title: "oder.locker - privacy" }];
}

export default function Privacy() {
  return (
    <div className="flex flex-1 flex-col px-1 pt-1 pb-10">
      <h1
        id="page-title"
        className="pt-5 pb-5 font-antonio text-4xl leading-none"
      >
        Privacy
      </h1>
      <h2 className="font-medium">Bot protection</h2>
      <p className="mt-2 text-sm">
        This site uses Cloudflare Turnstile to tell humans and bots apart.
        Turnstile runs only on the sign up and login page. It works invisibly
        and looks only at technical signals from your browser and connection
        (such as your IP address and browser characteristics) to check that
        you're a real person. Cloudflare uses these signals solely to detect
        and block automated traffic — not to identify you, build a profile, or
        serve ads.
      </p>
      <p className="mt-2 text-sm">
        For details, see the{" "}
        <a
          href="https://www.cloudflare.com/turnstile-privacy-policy/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4"
        >
          Cloudflare Turnstile Privacy Addendum
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        .
      </p>
    </div>
  );
}
