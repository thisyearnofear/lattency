"use client";

// useContributor — the React surface over lib/contributor.ts. Mints an id on
// first mount, captures a one-time `?via=` referral from the URL, and exposes
// a way to promote the anonymous id to a connected Nimiq address so the
// contributor's status survives a browser change.
//
// Referral capture reads window.location.search inside an effect rather than
// useSearchParams(): the hook is used inside statically generated pages
// (app/[city], /cafes/[slug]), and useSearchParams without a Suspense boundary
// would bail those pages out of prerendering.

import { useCallback, useState } from "react";
import {
  bindContributorToAddress,
  captureReferral,
  contributorHandle,
  isBoundContributorId,
  readContributorId,
  readContributorName,
  readReferrals,
  readReferredBy,
  writeContributorName,
} from "@/lib/contributor";

export interface ContributorState {
  id: string;
  handle: string;
  displayName: string | null;
  referredBy: string | null;
  referralCount: number;
  /** True once the id has been promoted to a Nimiq address. */
  isBound: boolean;
}

function readState(): ContributorState {
  const id = readContributorId();
  return {
    id,
    handle: contributorHandle(id),
    displayName: readContributorName(),
    referredBy: readReferredBy(),
    referralCount: readReferrals().length,
    isBound: isBoundContributorId(id),
  };
}

export function useContributor() {
  // Capture a one-time ?via= referral during the lazy initializer (client
  // only), mirroring how contribution-celebration runs side effects in its
  // initializer. Doing it here — rather than in an effect calling setState —
  // avoids a cascading second render and keeps statically generated pages
  // free of a useSearchParams bailout.
  const [state, setState] = useState<ContributorState>(() => {
    if (typeof window !== "undefined") {
      const via = new URLSearchParams(window.location.search).get("via");
      if (via) captureReferral(via);
    }
    return readState();
  });

  const setDisplayName = useCallback((name: string) => {
    writeContributorName(name);
    setState((s) => ({ ...s, displayName: readContributorName() }));
  }, []);

  /** Promote the anonymous id to a Nimiq address (call once an address is known). */
  const bindToAddress = useCallback((address: string | null) => {
    if (!address) return;
    const id = bindContributorToAddress(address);
    setState((s) => ({
      ...s,
      id,
      handle: contributorHandle(id),
      isBound: isBoundContributorId(id),
    }));
  }, []);

  return { ...state, setDisplayName, bindToAddress };
}
