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
 * exit animation while the *current* key's content enters. The parent provides
 * a render function that receives a key and returns the content for that key.
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
    phase: "idle" | "exiting" | "entering";
  }>({
    currentKey: activeKey,
    previousKey: null,
    phase: "idle",
  });

  const activeKeyRef = useRef(activeKey);

  useEffect(() => {
    if (activeKeyRef.current === activeKey) return;
    activeKeyRef.current = activeKey;

    setState((prev) => ({
      currentKey: activeKey,
      previousKey: prev.currentKey,
      phase: "exiting",
    }));
  }, [activeKey]);

  useEffect(() => {
    if (state.phase !== "exiting") return;
    const timer = setTimeout(() => {
      setState((prev) => ({
        ...prev,
        previousKey: null,
        phase: "entering",
      }));
    }, duration);
    return () => clearTimeout(timer);
  }, [state.phase, duration]);

  useEffect(() => {
    if (state.phase !== "entering") return;
    const timer = setTimeout(() => {
      setState((prev) => ({ ...prev, phase: "idle" }));
    }, duration);
    return () => clearTimeout(timer);
  }, [state.phase, duration]);

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
        className={state.phase === "entering" ? "animate-panel-in" : ""}
      >
        {render(state.currentKey)}
      </div>
    </div>
  );
}
