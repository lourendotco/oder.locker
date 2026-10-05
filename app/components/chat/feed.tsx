import { createContext, use, useEffect, type ReactElement } from "react";
import { atom, useAtomValue, useSetAtom } from "jotai";

/** What a block on the feed says about itself. A new kind of block adds a
    member here. */
type FeedMeta =
  | { kind: "voice"; id: string }
  | { kind: "discuss" }
  | { kind: "discussion" };

export type FeedEntry = FeedMeta & {
  /** The block has finished showing itself, so the next one can start. */
  done: boolean;
};

// The blocks on the feed, in order. Each needs a key.
const feedAtom = atom<ReactElement[]>([]);

// What the blocks have registered about themselves, by their key.
const feedEntriesAtom = atom<Record<string, FeedEntry>>({});

// Tells a block its own key.
const FeedKey = createContext<string | null>(null);

export function Feed() {
  const feed = useAtomValue(feedAtom);
  return feed.map((node) => (
    <FeedKey key={node.key} value={node.key}>
      {node}
    </FeedKey>
  ));
}

/** Registers a block on the feed for as long as it is mounted. `active`
    turns true once every block before it is done; `finish` marks this one
    done. */
export function useFeedItem(meta: FeedMeta) {
  const key = use(FeedKey);
  if (key === null) throw new Error("A feed block needs a key");
  const feed = useAtomValue(feedAtom);
  const entries = useAtomValue(feedEntriesAtom);
  const setEntries = useSetAtom(feedEntriesAtom);

  useEffect(() => {
    setEntries((entries) => ({ ...entries, [key]: { ...meta, done: false } }));
    return () => setEntries(({ [key]: _, ...entries }) => entries);
  }, [key]);

  const index = feed.findIndex((node) => node.key === key);
  // A block that has not registered yet is not done.
  const active = feed
    .slice(0, index)
    .every((node) => node.key !== null && entries[node.key]?.done);
  const finish = () =>
    setEntries((entries) =>
      entries[key] && !entries[key].done
        ? { ...entries, [key]: { ...entries[key], done: true } }
        : entries,
    );

  return { active, finish };
}

/** For whoever drives the feed: what is on it, and a way to add to it. */
export function useFeed() {
  const entries = useAtomValue(feedEntriesAtom);
  const setFeed = useSetAtom(feedAtom);

  return {
    /** The registered blocks. */
    entries: Object.values(entries),
    /** Adds blocks to the end, skipping any whose key is already there. */
    append: (...nodes: ReactElement[]) =>
      setFeed((feed) => [
        ...feed,
        ...nodes.filter((node) => !feed.some(({ key }) => key === node.key)),
      ]),
  };
}
