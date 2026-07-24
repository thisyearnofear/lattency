"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { init, type NimiqProvider as SdkNimiqProvider } from "@nimiq/mini-app-sdk";

/**
 * Payment request shape. The @nimiq/mini-app-sdk types don't currently
 * expose requestPayment on the NimiqProvider interface, but the runtime
 * provider supports it when running inside Nimiq Pay.
 */
export interface PaymentRequest {
  recipient: string;
  value: number;
  message?: string;
}

export interface NimiqPaymentResult {
  txHash: string;
}

export interface LattencyNimiqProvider extends SdkNimiqProvider {
  requestPayment: (req: PaymentRequest) => Promise<NimiqPaymentResult>;
}

interface NimiqContextValue {
  /** The SDK provider, once initialized. */
  provider: LattencyNimiqProvider | null;
  /** First connected account address, if available. */
  address: string | null;
  /** True while waiting for the host to inject the SDK. */
  loading: boolean;
  /** Error if the SDK failed to initialize. */
  error: Error | null;
  /** True when running inside a Nimiq Pay WebView (window.nimiq is present). */
  inMiniApp: boolean;
}

const NimiqContext = createContext<NimiqContextValue | null>(null);

export function NimiqProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<LattencyNimiqProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [inMiniApp] = useState(() => {
    if (typeof window === "undefined") return false;
    return "nimiq" in window;
  });

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const p = (await init()) as LattencyNimiqProvider;
        if (cancelled) return;
        setProvider(p);
        try {
          const result = await p.listAccounts();
          if (cancelled) return;
          if (Array.isArray(result) && result.length > 0) {
            setAddress(result[0]);
          }
        } catch {
          // Listing accounts is optional; don't fail the whole provider.
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <NimiqContext.Provider
      value={{ provider, address, loading, error, inMiniApp }}
    >
      {children}
    </NimiqContext.Provider>
  );
}

export function useNimiq(): NimiqContextValue {
  const ctx = useContext(NimiqContext);
  if (!ctx) {
    throw new Error("useNimiq must be used inside a NimiqProvider");
  }
  return ctx;
}
