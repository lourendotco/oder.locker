import { CaretRightIcon } from "@phosphor-icons/react";
import { Link } from "react-router";
import type { Route } from "./+types/weeks";
import { PageTransition } from "~/components/layout/PageTransition";
import { requireUser } from "~/lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return null;
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "oder.locker - previous weeks" }];
}

export default function Profile() {
  return (
    <PageTransition>
      <div className="flex flex-1 flex-col gap-2 px-1 pt-1 pb-10">
        <h1
          id="page-title"
          className="pt-5 pb-5 font-antonio text-4xl leading-none"
        >
          Previous weeks
        </h1>
        <ul role="list" className="flex flex-col gap-2">
          <li>
            <Link to="/theme" className="flex items-center gap-2">
              {/* Decorative: the text next to it says what the week is about. */}
              <img
                src="/5025232.webp"
                alt=""
                className="aspect-[0.7] h-25 w-auto rounded object-cover drop-shadow-lg"
              />
              <div className="flex h-full flex-col justify-between text-xs">
                <div>
                  <h2 className="text-base font-medium">Week 0</h2>
                  <p>
                    Should internet providers have to store your IP address to
                    help police investigate serious crimes?
                  </p>
                </div>
                <p className="text-neutral-600">16 people engaged</p>
              </div>
              <CaretRightIcon aria-hidden size={60} weight="fill" />
            </Link>
          </li>
        </ul>
      </div>
    </PageTransition>
  );
}
