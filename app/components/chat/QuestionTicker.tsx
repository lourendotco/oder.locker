import { useState } from "react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

const arrow =
  "shrink-0 cursor-pointer p-1 transition-[scale] active:scale-95";

/** One question at a time, with an arrow to either side. Past the last
    question comes the first again, and the other way around. */
export function QuestionTicker({ questions }: { questions: string[] }) {
  const [index, setIndex] = useState(0);
  const step = (by: number) =>
    setIndex((index) => (index + by + questions.length) % questions.length);

  return (
    <div role="group" aria-label="Questions" className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Previous question"
        onClick={() => step(-1)}
        className={arrow}
      >
        <CaretLeftIcon aria-hidden size={18} weight="bold" />
      </button>
      {/* Two lines tall, so a short question doesn't move what is below. */}
      <p
        aria-live="polite"
        className="flex min-h-[2lh] min-w-0 flex-1 items-center justify-center text-center text-gray-700"
      >
        {questions[index]}
      </p>
      <button
        type="button"
        aria-label="Next question"
        onClick={() => step(1)}
        className={arrow}
      >
        <CaretRightIcon aria-hidden size={18} weight="bold" />
      </button>
    </div>
  );
}
