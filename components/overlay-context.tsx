"use client";

// One active overlay at a time. Previously every surface (café drawer,
// contribution modal, concierge) owned an independent boolean, so the
// concierge could open on top of a drawer and fixed tickets could sit above
// modal backdrops. This context makes "what is open" a single decision:
// opening one surface closes the previous one, and fixed tickets (the
// concierge launcher, the onboarding coach) suppress themselves while any
// surface is active.
//
// Layers (see AGENTS.md design language):
//   40 navigation · 50 backdrop · 60 drawer/modal content · 70 toasts

import { createContext, useCallback, useContext, useState } from "react";

export type OverlaySurface = "cafe" | "contribute" | "concierge" | null;

interface OverlayState {
  active: OverlaySurface;
  open: (s: Exclude<OverlaySurface, null>) => void;
  close: () => void;
  toggle: (s: Exclude<OverlaySurface, null>) => void;
}

const Ctx = createContext<OverlayState>({
  active: null,
  open: () => {},
  close: () => {},
  toggle: () => {},
});

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<OverlaySurface>(null);

  const open = useCallback(
    (s: Exclude<OverlaySurface, null>) => setActive(s),
    [],
  );
  const close = useCallback(() => setActive(null), []);
  const toggle = useCallback(
    (s: Exclude<OverlaySurface, null>) =>
      setActive((prev) => (prev === s ? null : s)),
    [],
  );

  return (
    <Ctx.Provider value={{ active, open, close, toggle }}>
      {children}
    </Ctx.Provider>
  );
}

export function useOverlay() {
  return useContext(Ctx);
}
