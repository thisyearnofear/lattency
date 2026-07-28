"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface CrossfadePanelProps {
  activeKey: string;
  render: (key: string) => ReactNode;
  duration?: number;
  className?: string;
}

const DEFAULT_DURATION = 220;

/**
 * CrossfadePanel — keeps the *previous* key's content mounted during a short
 * exit animation while the *current* key's content enters concurrently. The
 * parent provides a render function that receives a key and returns the
 * content for that key.
 *
 * The transition is a true crossfade: the old panel fades out (absolute,
 * pointer-events-none) while the new panel fades in, both animating for the
 * same duration. After one duration the old panel is removed and the
 * component returns to idle. This avoids the flash the three-phase
 * (exit → enter → idle) version produced, where the new panel appeared at
 * full opacity, flashed to zero, then rose back in.
 *
 * Important: the render function should be stable for a given key during the
 * transition. If it depends on rapidly changing state the exit snapshot may
 * update mid-animation.
 */
export function CrossfadePanel({
  activeKey,
  render,
  duration = DEFAULT_DURATION,
  className = "",
}: CrossfadePanelProps) {
  const [state, setState] = useState<{
    currentKey: string;
    previousKey: string | null;
    transitioning: boolean;
  }>({
    currentKey: activeKey,
    previousKey: null,
    transitioning: false,
  });

  const activeKeyRef = useRef(activeKey);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (activeKeyRef.current === activeKey) return;
    activeKeyRef.current = activeKey;

    // Rapid key changes: clear any pending transition-end timer so the
    // new transition's duration isn't cut short by the old one's timer.
    if (timerRef.current) clearTimeout(timerRef.current);

    setState((prev) => ({
      currentKey: activeKey,
      previousKey: prev.currentKey,
      transitioning: true,
    }));

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setState((prev) => ({ ...prev, previousKey: null, transitioning: false }));
    }, duration);
  }, [activeKey, duration]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      {state.previousKey && (
        <div
          key={`exit-${state.previousKey}`}
          className="absolute inset-0 pointer-events-none animate-panel-out"
          aria-hidden
        >
          {render(state.previousKey)}
        </div>
      )}
      <div
        key={`enter-${state.currentKey}`}
        className={state.transitioning ? "animate-panel-in" : ""}
      >
        {render(state.currentKey)}
      </div>
    </div>
  );
}
