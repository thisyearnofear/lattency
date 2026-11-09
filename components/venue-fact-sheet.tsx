"use client";

// VenueFactSheet — rung 2 of the contribution ladder as a standalone ask
// (docs/adaptive-ux-principles.md). One tap answers one unconfirmed fact
// on the venue record; each answer POSTs straight to
// /api/venues/[id]/facts and the row collapses under a "landed" stamp.
// Bottom-sheet chrome matches the newsprint identity — square, hard
// shadow, mono labels — and the whole run costs one interaction per fact.

import { useEffect, useRef, useState } from "react";
import type { CafeMetadata, CafeStation } from "@/lib/types";
import {
  MILK_LABELS,
  MILK_OPTIONS,
  NOISE_LEVELS,
  NOISE_LEVEL_LABELS,
  PRICE_TIERS,
  PRICE_TIER_LABELS,
  SEATING_LABELS,
  SEATING_TYPES,
  TABLE_SPACES,
  TABLE_SPACE_LABELS,
  VENUE_TYPES,
  VENUE_TYPE_LABELS,
} from "@/lib/cafe-metadata";
import { readContributorId } from "@/lib/contributor";
import { postWithRetry } from "@/lib/fetch-retry";
import { haptic } from "@/lib/haptics";

const CHIP =
  "border border-ink/60 px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase text-ink hover:bg-ink hover:text-cream transition-colors disabled:opacity-50";
const FIELD =
  "mt-1.5 w-full bg-cream border border-ink/40 px-3 py-2 font-serif text-ink text-base placeholder:text-ink-faint/70 focus:outline-none focus:border-ink";

type RowKind = "yesno" | "chips" | "text";

interface FactRow {
  /** Entity field sent to the API (snake_case allowlist member). */
  field: string;
  /** Question the row asks. */
  label: string;
  kind: RowKind;
  /** Chips for enum fields; yesno and text don't carry options. */
  options?: Array<{ value: string; label: string }>;
}

function optionRows(vocab: readonly string[], labels: Record<string, string>) {
  return vocab.map((v) => ({ value: v, label: labels[v] ?? v }));
}

/** The unconfirmed fact rows for this venue. A row only renders while the
 *  underlying metadata field is unset — confirmed facts never re-ask. */
function unconfirmedRows(cafe: CafeStation): FactRow[] {
  const m: CafeMetadata = cafe.metadata ?? {};
  const rows: FactRow[] = [];

  if (m.powerOutlets === undefined) {
    rows.push({ field: "power_outlets", label: "Power outlets?", kind: "yesno" });
  }
  if (m.seating === undefined) {
    rows.push({
      field: "seating",
      label: "Seating?",
      kind: "chips",
      options: optionRows(SEATING_TYPES, SEATING_LABELS),
    });
  }
  if (m.noiseLevel === undefined) {
    rows.push({
      field: "noise_level",
      label: "Noise when busy?",
      kind: "chips",
      options: optionRows(NOISE_LEVELS, NOISE_LEVEL_LABELS),
    });
  }
  if (m.tableSpace === undefined) {
    rows.push({
      field: "table_space",
      label: "Table space for a laptop?",
      kind: "chips",
      options: optionRows(TABLE_SPACES, TABLE_SPACE_LABELS),
    });
  }
  if (m.priceTier === undefined) {
    rows.push({
      field: "price_tier",
      label: "Coffee price?",
      kind: "chips",
      options: optionRows(PRICE_TIERS, PRICE_TIER_LABELS),
    });
  }
  if (!m.milkOptions || m.milkOptions.length === 0) {
    rows.push({
      field: "milk_options",
      label: "Milk on the menu?",
      kind: "chips",
      options: optionRows(MILK_OPTIONS, MILK_LABELS),
    });
  }
  if (m.wifiNetwork === undefined) {
    rows.push({ field: "wifi_network", label: "WiFi network name?", kind: "text" });
  }
  if (!cafe.venueType) {
    rows.push({
      field: "venue_type",
      label: "What kind of place is it?",
      kind: "chips",
      options: optionRows(VENUE_TYPES, VENUE_TYPE_LABELS),
    });
  }
  return rows;
}

type RowStatus = "sending" | "done" | "error";

export function VenueFactSheet({
  cafe,
  open,
  onClose,
  onLanded,
}: {
  cafe: CafeStation;
  open: boolean;
  onClose: () => void;
  onLanded?: () => void;
}) {
  // Rows are seeded from the venue's unconfirmed fields each time the
  // sheet opens; answered rows collapse out of the list, they don't
  // linger as checked-off items.
  const [rows, setRows] = useState<FactRow[]>([]);
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wifiName, setWifiName] = useState("");
  const landedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    // Deferred so the open transition and the reseed don't cascade in the
    // same render — same pattern the ask card uses for localStorage reads.
    const t = setTimeout(() => {
      setRows(unconfirmedRows(cafe));
      setStatuses({});
      setErrors({});
      setWifiName("");
      landedRef.current = false;
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reseed per open
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function answer(field: string, value: unknown) {
    if (statuses[field] === "sending" || statuses[field] === "done") return;
    setStatuses((s) => ({ ...s, [field]: "sending" }));
    setErrors((e) => ({ ...e, [field]: "" }));
    try {
      const res = await postWithRetry(`/api/venues/${encodeURIComponent(cafe.id)}/facts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          value,
          contributorId: readContributorId(),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setStatuses((s) => ({ ...s, [field]: "error" }));
        setErrors((e) => ({
          ...e,
          [field]: data?.error ?? "Couldn't send — try again",
        }));
        return;
      }
      haptic(15);
      setStatuses((s) => ({ ...s, [field]: "done" }));
      if (!landedRef.current) {
        landedRef.current = true;
        onLanded?.();
      }
      // The stamp lands, then the row collapses out of the list.
      setTimeout(() => {
        setRows((rs) => rs.filter((r) => r.field !== field));
      }, 1100);
    } catch {
      setStatuses((s) => ({ ...s, [field]: "error" }));
      setErrors((e) => ({ ...e, [field]: "Couldn't send — try again" }));
    }
  }

  function sendWifi() {
    const value = wifiName.trim();
    if (!value || value.length > 64) return;
    void answer("wifi_network", value);
  }

  return (
    <div
      aria-hidden={!open}
      inert={!open}
      className={`fixed inset-0 z-[60] ${open ? "" : "pointer-events-none"}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Confirm a detail about ${cafe.name}`}
    >
      <div
        className={`absolute inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`absolute bottom-0 left-0 right-0 mx-auto flex w-full max-w-[520px] max-h-[85vh] flex-col border-x border-t border-ink/80 bg-cream shadow-[0_-12px_40px_rgba(26,22,18,0.25)] transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink/15 px-5 py-4">
          <div>
            <p className="stamp">One fact · this station</p>
            <p className="font-display font-black uppercase leading-none tracking-[-0.01em] text-ink text-xl mt-0.5">
              Confirm a detail
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft transition-colors hover:text-ink"
          >
            Close ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="font-serif italic text-ink-soft text-sm leading-snug">
            Tap what you can see from the table — each answer lands on{" "}
            {cafe.name}&rsquo;s card. Community-reported, not verified.
          </p>

          <div className="mt-4 space-y-3">
            {rows.length === 0 && (
              <p className="border border-ink/40 bg-cream-edge/60 px-4 py-3 font-serif italic text-ink-soft text-sm">
                Every detail on this station is confirmed — thanks, crew.
              </p>
            )}
            {rows.map((row) => {
              const status = statuses[row.field];
              return (
                <div
                  key={row.field}
                  className="border border-ink/80 bg-cream px-4 py-3 shadow-[3px_4px_0_0_var(--color-ink)]"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink">
                      {row.label}
                    </p>
                    {status === "done" && (
                      <span className="celebration-stamp inline-block border-2 border-express px-2 py-0.5 font-display font-black uppercase text-express text-xs">
                        Landed
                      </span>
                    )}
                  </div>
                  {status !== "done" && (
                    <div className="mt-2">
                      {row.kind === "yesno" && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={status === "sending"}
                            onClick={() => void answer(row.field, true)}
                            className={CHIP}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            disabled={status === "sending"}
                            onClick={() => void answer(row.field, false)}
                            className={CHIP}
                          >
                            No
                          </button>
                        </div>
                      )}
                      {row.kind === "chips" && (
                        <div className="flex flex-wrap gap-2">
                          {row.options!.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              disabled={status === "sending"}
                              onClick={() => void answer(row.field, opt.value)}
                              className={CHIP}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {row.kind === "text" && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={wifiName}
                            maxLength={64}
                            onChange={(e) => setWifiName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                sendWifi();
                              }
                            }}
                            placeholder="e.g. Guest-WiFi"
                            aria-label={row.label}
                            className={`${FIELD} mt-0 flex-1`}
                          />
                          <button
                            type="button"
                            disabled={
                              status === "sending" || !wifiName.trim()
                            }
                            onClick={sendWifi}
                            className={`${CHIP} shrink-0 bg-ink text-cream hover:bg-ink/90`}
                          >
                            Send
                          </button>
                        </div>
                      )}
                      {status === "sending" && (
                        <p className="mt-1.5 font-mono text-[9px] tracking-[0.2em] uppercase text-ink-faint">
                          Sending…
                        </p>
                      )}
                      {status === "error" && errors[row.field] && (
                        <p className="mt-1.5 font-mono text-[9px] tracking-[0.16em] uppercase text-suspended">
                          {errors[row.field]}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-4 font-mono text-[9px] tracking-[0.18em] uppercase text-ink-faint">
            Community-reported · counts toward your trail
          </p>
        </div>
      </div>
    </div>
  );
}
