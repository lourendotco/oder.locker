import { waitUntil } from "cloudflare:workers";
import { useEffect, useRef, useState } from "react";
import { Link, redirect, useFetcher } from "react-router";
import { CameraIcon } from "@phosphor-icons/react";
import type { Route } from "./+types/home";
import Turnstile, { type TurnstileHandle } from "~/components/Turnstile";
import {
  authCompleteSignup,
  authGuestSignIn,
  authIssueOtp,
  authSignupProofValid,
  authVerifyCode,
} from "~/lib/auth.server";
import { photoDelete, photoStore, SIGNUP_MAX_BYTES } from "~/lib/photo.server";
import {
  emailRx,
  getUser,
  guestRx,
  sessionHeaders,
  verifyTurnstile,
} from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "oder.locker" }, { name: "description", content: "oder?" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (await getUser(request)) throw redirect("/theme");
  return null;
}

// What the form shows next. `notice` is neutral feedback, `error` a refusal.
type Result =
  | { step: "email"; error: string }
  | { step: "code"; error: string; notice?: string }
  | { step: "signup"; signupToken: string; error: string };

export async function action({ request }: Route.ActionArgs): Promise<Result> {
  const nextParam = new URL(request.url).searchParams.get("next");
  const next = nextParam && /^\/[^/\\]/.test(nextParam) ? nextParam : "/theme";

  // formData() reads the whole body into memory, so refuse an oversized one
  // on its declared length first. The form itself never comes close: it sends
  // a picture already cropped in the browser.
  const length = request.headers.get("content-length");
  if (!length || Number(length) > SIGNUP_MAX_BYTES) {
    throw new Response(null, { status: 413 });
  }

  const formData = await request.formData();
  const signupToken = formData.get("signupToken");

  // third step: a brand-new account picks its username, name and picture
  if (typeof signupToken === "string" && signupToken) {
    const expired: Result = {
      step: "email",
      error: "that took too long — please start again",
    };
    const retry = (error: string): Result => ({
      step: "signup",
      signupToken,
      error,
    });

    // before accepting an upload from whoever holds this token
    if (!(await authSignupProofValid(signupToken))) return expired;

    const photo = formData.get("photo");
    let photoKey: string | null = null;
    if (photo instanceof File && photo.size > 0) {
      photoKey = await photoStore(photo);
      if (!photoKey) {
        return retry("that picture can't be used — try another, under 2 MB");
      }
    }

    const result = await authCompleteSignup(signupToken, {
      username: String(formData.get("username") ?? ""),
      name:
        String(formData.get("name") ?? "")
          .trim()
          .slice(0, 60) || null,
      photoKey,
    });

    if (!result || "error" in result) {
      // the picture belongs to an account that did not come to be
      if (photoKey) waitUntil(photoDelete(photoKey));
      if (!result) return expired;
      return retry(
        result.error === "username_taken"
          ? "that username is taken"
          : "invalid username",
      );
    }
    throw redirect(next, { headers: sessionHeaders(result.token) });
  }

  // trimmed here: the field is not type="email", so the browser doesn't
  const email = String(formData.get("email") ?? "").trim();
  const code = formData.get("code");

  // second step: the emailed code
  if (code) {
    const result = await authVerifyCode(email, String(code));

    if (!result) return { step: "code", error: "invalid or expired code" };
    // a brand-new account still needs a username before it gets a session
    if (result.pending) {
      return { step: "signup", signupToken: result.token, error: "" };
    }
    throw redirect(next, { headers: sessionHeaders(result.token) });
  }

  // first step: send a code (sign-in or sign-up alike), turnstile-gated
  const guest = guestRx.test(email);
  if (!guest && !emailRx.test(email)) {
    return { step: "email", error: "invalid email address" };
  }
  if (!(await verifyTurnstile(formData, request))) {
    return { step: "email", error: "verification failed — please try again" };
  }

  // a guest name skips the code: straight to a session
  if (guest) {
    const token = await authGuestSignIn(email);
    if (!token) return { step: "email", error: "that guest name is taken" };
    throw redirect(next, { headers: sessionHeaders(token) });
  }

  // avoid enumeration
  waitUntil(authIssueOtp(email));
  return {
    step: "code",
    error: "",
    notice: formData.has("resend") ? "requested a new code" : undefined,
  };
}

const field =
  "w-80 rounded-xl bg-secondary px-2.5 py-1 text-lg text-white placeholder:text-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary";
const submit =
  "w-80 cursor-pointer rounded-xl bg-primary px-2.5 py-1 text-right text-lg font-medium text-white hover:bg-primary/85 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60";
const textButton =
  "cursor-pointer text-sm underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50";
// A paragraph, not <em>: it is a message, not emphasis. red-700 because
// red-600 falls short of 4.5:1 on the page's grey.
const errorText = "w-80 text-sm text-red-700 italic";

// Centre-crops a picked image to a square of at most 512px and re-encodes it
// as JPEG: a small upload, and nothing of the original file (EXIF, location)
// leaves the device. null when the browser can't decode the file.
async function squarePhoto(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const size = Math.min(side, 512);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    canvas
      .getContext("2d")!
      .drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        size,
        size,
      );
    bitmap.close();
    return await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
  } catch {
    return null;
  }
}

export default function Home({}: Route.ComponentProps) {
  const fetcher = useFetcher<typeof action>();
  const result = fetcher.data;
  const busy = fetcher.state !== "idle";

  const [email, setEmail] = useState("");
  // arrived through the link in the code email: straight to the code step
  const [fromLink, setFromLink] = useState(false);
  // the result that "use a different email" walked away from
  const [dismissed, setDismissed] = useState<Result>();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const resendForm = useRef<HTMLFormElement>(null);
  const resendTurnstile = useRef<TurnstileHandle>(null);

  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>();
  const [photoError, setPhotoError] = useState("");

  // The email rides the link's fragment (see emails.ts); take it and clean the URL.
  useEffect(() => {
    const fromHash = decodeURIComponent(window.location.hash.substring(1));
    if (!fromHash) return;
    setEmail(fromHash);
    setFromLink(true);
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }, []);

  useEffect(() => {
    if (!photo) return setPhotoUrl(undefined);
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const current = result && result !== dismissed ? result : undefined;
  const step = current?.step ?? (fromLink ? "code" : "email");

  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      {step === "signup" && current?.step === "signup" ? (
        <fetcher.Form
          key="signup"
          method="post"
          encType="multipart/form-data"
          aria-labelledby="page-title"
          className="flex flex-col items-center gap-2"
          onSubmit={(e) => {
            // the picked file is replaced by its cropped, re-encoded version
            e.preventDefault();
            const body = new FormData(e.currentTarget);
            if (photo) body.set("photo", photo, "photo.jpg");
            fetcher.submit(body, {
              method: "post",
              encType: "multipart/form-data",
            });
          }}
        >
          <input type="hidden" name="signupToken" value={current.signupToken} />
          <h1
            id="page-title"
            className="translate-y-1 text-lg font-medium text-secondary"
          >
            almost there
          </h1>
          <label
            className={`flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-secondary text-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-secondary`}
          >
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <CameraIcon aria-hidden size={32} weight="duotone" />
            )}
            <span className="sr-only">profile picture (optional)</span>
            {/* no name: the action gets the processed blob, not this file */}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const squared = await squarePhoto(file);
                setPhoto(squared);
                setPhotoError(squared ? "" : "that picture can't be read");
              }}
            />
          </label>
          <p className="text-sm">
            {photo ? (
              <button
                type="button"
                className={textButton}
                onClick={() => setPhoto(null)}
              >
                remove picture
              </button>
            ) : (
              "add a picture, if you like"
            )}
          </p>
          {photoError && (
            <p role="alert" className={errorText}>
              {photoError}
            </p>
          )}
          <label htmlFor="username" className="sr-only">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            maxLength={40}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
            placeholder="username"
            // Ties the message to the field, for whoever comes back to it.
            aria-describedby={current.error ? "signup-error" : undefined}
            className={field}
          />
          <label htmlFor="name" className="sr-only">
            Name (optional)
          </label>
          <input
            id="name"
            name="name"
            type="text"
            maxLength={60}
            autoComplete="name"
            placeholder="name (optional)"
            className={field}
          />
          {current.error && (
            <p id="signup-error" role="alert" className={errorText}>
              {current.error}
            </p>
          )}
          <button type="submit" disabled={busy} className={submit}>
            create account
          </button>
        </fetcher.Form>
      ) : step === "code" ? (
        <div className="flex flex-col items-center gap-2">
          <fetcher.Form
            key="code"
            method="post"
            aria-labelledby="page-title"
            className="flex flex-col items-center gap-2"
          >
            <input type="hidden" name="email" value={email} />
            <h1
              id="page-title"
              className="w-80 translate-y-1 text-center text-lg font-medium text-secondary"
            >
              enter the code we sent to
              <span className="block truncate text-black">{email}</span>
            </h1>
            <label htmlFor="code" className="sr-only">
              6-digit code
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              required
              placeholder="······"
              aria-invalid={current?.error ? true : undefined}
              aria-describedby={current?.error ? "code-error" : undefined}
              className={`${field} text-center tracking-[0.3em]`}
            />
            {current?.error ? (
              <p id="code-error" role="alert" className={errorText}>
                {current.error}
              </p>
            ) : (
              current?.step === "code" &&
              current.notice && (
                <p role="status" className="w-80 text-sm">
                  {current.notice}
                </p>
              )
            )}
            <button type="submit" disabled={busy} className={submit}>
              continue
            </button>
          </fetcher.Form>
          <div className="flex w-80 justify-between">
            <fetcher.Form
              method="post"
              ref={resendForm}
              onSubmit={(e) => {
                // tokens are single-use and the widget resets after every
                // result, so every resend starts with a fresh challenge
                e.preventDefault();
                setResending(true);
                resendTurnstile.current?.execute();
              }}
            >
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="resend" value="1" />
              <Turnstile
                ref={resendTurnstile}
                execution="execute"
                resetSignal={result}
                onToken={(token) => {
                  if (token) fetcher.submit(resendForm.current);
                  setResending(false);
                }}
              />
              <button
                type="submit"
                disabled={resending || busy}
                className={textButton}
              >
                send a new code
              </button>
            </fetcher.Form>
            <button
              type="button"
              className={textButton}
              onClick={() => {
                setDismissed(result);
                setFromLink(false);
              }}
            >
              use another email
            </button>
          </div>
          <p className="w-80 pt-2 text-xs text-neutral-600">
            No email? To prevent spam we invalidate codes and stop sending
            emails after a few attempts. If you got the code wrong or missed the
            email, try again later.&nbsp;
            <Link to="/privacy" className="font-medium underline">
              Privacy policy
            </Link>
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-10">
          {/* Spacers, not justify-center: the free space is split 2:3, so the
              content sits above centre by a share of what is left over. */}
          <div className="flex-[1]" />
          <figure className="w-80 max-w-prose rounded-2xl bg-white p-4 text-sm text-gray-700 drop-shadow-md">
            {/* the page is lang="en": without this the quote is read with English pronunciation */}
            <blockquote lang="de">
              Einer hat immer Unrecht: aber mit zweien beginnt die Wahrheit. –
              Einer kann sich nicht beweisen: aber zweie kann man bereits nicht
              widerlegen.
            </blockquote>
            <figcaption className="pt-2 text-right text-xs font-antonio">
              — F. Nietzsche, 1882
            </figcaption>
          </figure>
          <fetcher.Form
            key="email"
            method="post"
            aria-labelledby="page-title"
            className="flex flex-col items-center gap-2 "
          >
            <h1
              id="page-title"
              className="translate-y-1 text-lg font-medium text-secondary"
            >
              Sign up or login
            </h1>
            <label htmlFor="email" className="sr-only">
              Email address
            </label>
            <input
              id="email"
              name="email"
              // not type="email": the browser would refuse a guest name
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              spellCheck={false}
              required
              placeholder="email"
              aria-describedby={
                current?.error ? "email-error email-hint" : "email-hint"
              }
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
            <Turnstile
              onToken={setTurnstileToken}
              resetSignal={result}
              className="w-80"
            />
            {current?.error && (
              <p id="email-error" role="alert" className={errorText}>
                {current.error}
              </p>
            )}
            <button
              type="submit"
              disabled={!turnstileToken || busy}
              className={submit}
            >
              continue
            </button>
            <p id="email-hint" className="w-80 text-sm">
              Your data stays in the EU. To enter anonymously type{" "}
              <span className="font-mono font-bold">
                guest_&lt;any word&gt;
              </span>
              .
              <Link
                to="/privacy"
                className="block text-xs font-medium underline"
              >
                Privacy
              </Link>
            </p>
          </fetcher.Form>
          <div className="flex-[4]" />
        </div>
      )}
    </div>
  );
}
