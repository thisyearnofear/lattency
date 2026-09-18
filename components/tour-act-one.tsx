"use client";

// Act 01 shell — boarding stamp gates the reel so skip/revisit don't leave
// the storyboard waiting on a dead timer.

import { useState } from "react";
import { TourBoarding } from "@/components/tour-boarding";
import { TourHero } from "@/components/tour-hero";
import { LoopStoryboard } from "@/components/loop-storyboard";

export function TourActOne() {
  const [boarded, setBoarded] = useState(false);

  return (
    <>
      <TourBoarding onDone={() => setBoarded(true)} />
      <main className="mx-auto max-w-[1440px] px-4 sm:px-6 md:px-12 pb-4">
        <TourHero />
        <LoopStoryboard hero hold={!boarded} />
      </main>
    </>
  );
}
