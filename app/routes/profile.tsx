import { CalendarDotsIcon, ChatsIcon, MapPinIcon, MicrophoneIcon } from "@phosphor-icons/react";
import { Form } from "react-router";
import type { Route } from "./+types/profile";
import { Avatar } from "~/components/layout/Avatar";
import { PageTransition } from "~/components/layout/PageTransition";
import { requireUser } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "oder.locker - your profile" }];
}

export function loader({ request }: Route.LoaderArgs) {
  return requireUser(request);
}

export default function Profile({ loaderData: user }: Route.ComponentProps) {
  return (
    <PageTransition>
      <div className="flex flex-1 flex-col gap-2 px-2.5 pt-1 pb-10">
        <div className="py-2.5">
          <div className="flex items-center justify-between font-antonio">
            <div>
              <h1 className="text-4xl leading-none">{user.username}</h1>
              {user.name && (
                <p className="pl-0.5 text-neutral-600">{user.name}</p>
              )}
            </div>
            <Avatar user={user} className="h-20 w-20 text-4xl" />
          </div>
          <ul role="list" className="flex flex-col gap-1.5 pt-2 pb-3 text-sm">
            <li className="flex items-center gap-1">
              <CalendarDotsIcon
                aria-hidden
                weight="duotone"
                className="fill-black text-xl"
              />
              Weeks Engaged: 1
            </li>
            <li className="flex items-center gap-1">
              <MapPinIcon
                aria-hidden
                weight="duotone"
                className="fill-black text-xl"
              />
              {/* The pin is all that says what "Berlin" is. */}
              <span className="sr-only">Location:</span>
              Berlin
            </li>
          </ul>
        </div>
        <section aria-labelledby="week-0" className="flex flex-col gap-1.5">
          <h2 id="week-0" className="flex gap-4 font-bold">
            <span className="">Week 0</span>
            <span className="text-neutral-600">Okt 4 - 10</span>
          </h2>
          <p className="mx-2 rounded bg-black/5 px-1.5 py-1 text-sm">
            Should internet providers have to store your IP address to help
            police investigate serious crimes?
          </p>
          <div className="ml-2 flex items-center gap-1 text-sm">
            <MicrophoneIcon aria-hidden className="text-base" />
            <p>
              Discussed with <span className="font-bold">louise</span>,{" "}
              <span className="font-bold">step</span> and{" "}
              <span className="font-bold">rose</span>.
            </p>
          </div>
          <div className="ml-2 flex items-center gap-1 text-sm">
            <ChatsIcon aria-hidden className="text-base" />
            <p>
              Posted <span className="underline">2 comments</span>.
            </p>
          </div>
        </section>
        <Form method="post" action="/logout" className="mt-auto pt-6">
          <button
            type="submit"
            className="cursor-pointer text-sm underline font-medium"
          >
            sign out
          </button>
        </Form>
      </div>
    </PageTransition>
  );
}
