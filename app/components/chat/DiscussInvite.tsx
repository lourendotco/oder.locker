import { useEffect } from "react";
import { MicrophoneIcon } from "@phosphor-icons/react";
import { useDiscussion } from "./Discussion";
import { reveal, useFeedItem } from "./feed";

export function DiscussInvite() {
  const { active, finish } = useFeedItem({ kind: "discuss" });
  const { discussing, start } = useDiscussion();

  // Nothing to wait for: whatever follows can start right away.
  useEffect(() => {
    if (active) finish();
  }, [active]);

  return (
    <div
      inert={!active}
      className={`mt-3 -mr-1 pl-2 ${reveal(active)}`}
    >
      <p>
        If you would like to, you can add another online user to this
        conversation. Click the microphone to start discussing, or 
        select "Discuss with another user" in the voices menu.
      </p>
      <button
        type="button"
        aria-label="Discuss with another user"
        disabled={discussing}
        onClick={start}
        className="gray-800 mx-auto my-3 block rounded-full bg-secondary p-3 text-white shadow-xs shadow-black transition-[scale,opacity] active:scale-95 disabled:opacity-40"
      >
        <MicrophoneIcon aria-hidden size={60} className="" weight="fill" />
      </button>
    </div>
  );
}
