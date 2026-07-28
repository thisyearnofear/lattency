"use client";

// Workspace Concierge — the map's oracle. A right-hand drawer (same idiom as
// the café detail drawer) wired to the Base44-hosted `workspace_concierge`
// agent. It reads Lattency's verified speed-test data and answers "where
// should I work?" with real numbers.
//
// Design language is native to Lattency: hard offset shadows, square
// corners, tier-square glyph, a departure-board empty state, and the oracle
// speaks in the editorial serif with an express-green rule — while the user
// speaks in mono. Gated on base44Configured so the mock build stays clean.

import { useCallback, useEffect, useRef, useState } from "react";
import { base44Configured, getBase44 } from "@/lib/base44";
import type { AgentConversation, AgentMessage } from "@base44/sdk";
import { useOverlay } from "@/components/overlay-context";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** True while the agent still has tools running. */
  tooling?: boolean;
  /** True when the reply drew on the dataset (had tool calls). */
  usedTools?: boolean;
  date: string;
}

function contentToString(content: AgentMessage["content"]): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  try {
    return JSON.stringify(content);
  } catch {
    return "";
  }
}

// Departure-board rows for the empty state — suggested queries styled as
// train departures, the transit language the whole app speaks.
const DEPARTURES: Array<{ dest: string; query: string }> = [
  { dest: "Video-call ready", query: "Where can I take a video call nearby?" },
  { dest: "Fastest line", query: "Fastest wifi in the area?" },
  { dest: "Quiet · oat · outlets", query: "Quiet spot with oat milk and outlets?" },
];

export function ConciergeChat() {
  const { active, open: openOverlay, close } = useOverlay();
  const open = active === "concierge";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const convoRef = useRef<AgentConversation | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const ensureConversation = useCallback(async () => {
    if (convoRef.current || !base44Configured) return;
    const base44 = getBase44();
    const convo = await base44.agents.createConversation({
      agent_name: "workspace_concierge",
    });
    convoRef.current = convo;

    base44.agents.subscribeToConversation(convo.id, (updated) => {
      const transcript: ChatMessage[] = updated.messages
        .filter((m) => !m.hidden && (m.role === "user" || m.role === "assistant"))
        .map((m) => ({
          id: m.id,
          role: m.role === "user" ? "user" : "assistant",
          content: contentToString(m.content),
          tooling: (m.tool_calls ?? []).some((t) => t.status === "running"),
          usedTools: (m.tool_calls ?? []).length > 0,
          date: m.created_date,
        }));
      setMessages(transcript);

      const last = updated.messages[updated.messages.length - 1];
      if (
        last?.role === "assistant" &&
        contentToString(last.content) &&
        !(last.tool_calls ?? []).some((t) => t.status === "running")
      ) {
        setBusy(false);
      }
    });

    setReady(true);
  }, []);

  useEffect(() => {
    if (open && !convoRef.current) {
      ensureConversation().catch(() => setBusy(false));
    }
  }, [open, ensureConversation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Close on Escape, matching the café detail drawer.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      await ensureConversation();
      const convo = convoRef.current;
      if (!convo) return;

      setInput("");
      setBusy(true);
      setMessages((prev) => [
        ...prev,
        {
          id: `u-${Date.now()}`,
          role: "user",
          content: trimmed,
          date: new Date().toISOString(),
        },
      ]);

      try {
        await getBase44().agents.addMessage(convo, {
          role: "user",
          content: trimmed,
        });
      } catch {
        setBusy(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: "The line is down — I couldn't reach the network. Try again in a moment.",
            date: new Date().toISOString(),
          },
        ]);
      }
    },
    [busy, ensureConversation],
  );

  if (!base44Configured) return null;

  return (
    <>
      {/* Launcher — a ticket, not a chat bubble. Tier-square glyph + pulsing
          live dot, hard shadow, lifts on hover like the bounty cards. */}          {!open && (
        <button
          type="button"
          onClick={() => openOverlay("concierge")}
          aria-label="Ask the Workspace Concierge"
          className="pressable fixed bottom-6 right-6 z-50 group flex items-center gap-3 bg-ink text-cream border border-ink px-4 py-3 shadow-[4px_5px_0_0_rgba(26,22,18,0.35)] hover:-translate-y-0.5 hover:shadow-[5px_7px_0_0_rgba(26,22,18,0.4)]"
        >
          <span className="flex h-7 w-7 items-center justify-center bg-express font-display font-black text-[16px] text-cream">
            ?
          </span>
          <span className="text-left">
            <span className="block font-mono text-[9px] uppercase leading-none tracking-[0.24em] text-cream/60">
              Workspace concierge
            </span>
            <span className="block font-display font-black uppercase leading-tight tracking-[-0.01em] text-[15px]">
              Ask the Oracle
            </span>
          </span>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-express" aria-hidden />
        </button>
      )}

      {/* Drawer — same right-drawer idiom as the café detail: always
          mounted, slide-in/out on a transform transition so it plays both
          directions and stays interruptible mid-flight. */}
      <div
        aria-hidden={!open}
        className={`fixed inset-0 z-[60] ${open ? "" : "pointer-events-none"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Workspace concierge"
      >
          <div
            className={`absolute inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity duration-300 ${
              open ? "opacity-100" : "opacity-0"
            }`}
            onClick={() => close()}
            aria-hidden
          />
          <div
            className={`absolute right-0 top-0 flex full-dvh w-full max-w-[420px] flex-col border-l border-ink/80 bg-cream shadow-[-12px_0_40px_rgba(26,22,18,0.25)] transition-transform duration-300 ease-out pb-[env(safe-area-inset-bottom)] ${
              open ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-ink/15 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center bg-express font-display font-black text-[20px] text-cream shadow-[3px_3px_0_0_var(--color-ink)]">
                  ?
                </span>
                <div>
                  <p className="stamp">Workspace concierge</p>
                  <p className="font-display font-black uppercase leading-none tracking-[-0.01em] text-ink text-xl mt-0.5">
                    Ask the Oracle
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => close()}
                aria-label="Close"
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft transition-colors hover:text-ink"
              >
                Close ✕
              </button>
            </div>

            {/* Messages / departure board */}
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {messages.length === 0 && !busy && (
                <div className="msg-in">
                  <p className="font-serif italic leading-relaxed text-ink-soft text-[15px]">
                    I&rsquo;ve read every verified speed test on this network.
                    Ask me where to work and I&rsquo;ll answer with real numbers
                    — no vibes, no guesswork.
                  </p>

                  {/* Departure board of suggested queries */}
                  <div className="mt-5 border border-ink/80 bg-cream shadow-[4px_5px_0_0_var(--color-ink)]">
                    <div className="flex items-center justify-between border-b border-ink/80 bg-ink px-3 py-2">
                      <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-cream">
                        Departures
                      </span>
                      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-cream/50">
                        Suggested queries
                      </span>
                    </div>
                    <ul>
                      {DEPARTURES.map((d) => (
                        <li key={d.query} className="border-b border-ink/10 last:border-b-0">
                          <button
                            type="button"
                            onClick={() => send(d.query)}
                            className="group flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-ink"
                          >
                            <span className="flex items-center gap-2.5">
                              <span className="font-display font-black text-express text-[15px] group-hover:text-cream" aria-hidden>
                                →
                              </span>
                              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink group-hover:text-cream">
                                {d.dest}
                              </span>
                            </span>
                            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint group-hover:text-cream/70">
                              Ask
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="msg-in flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap bg-ink px-3 py-2 font-mono text-[12px] leading-relaxed text-cream shadow-[3px_4px_0_0_rgba(26,22,18,0.25)]">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="msg-in relative pl-3.5">
                    <span className="absolute bottom-0 left-0 top-0 w-[3px] bg-express" aria-hidden />
                    {m.usedTools && !m.tooling && m.content && (
                      <p className="stamp mb-1 text-ink-faint">· consulted the network</p>
                    )}
                    <p className="whitespace-pre-wrap font-serif italic leading-relaxed text-ink text-[15px]">
                      {m.tooling && !m.content ? (
                        <span className="inline-flex items-center gap-1 font-mono not-italic text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                          consulting the map
                          <span className="think-dot">■</span>
                          <span className="think-dot">■</span>
                          <span className="think-dot">■</span>
                        </span>
                      ) : (
                        m.content
                      )}
                    </p>
                  </div>
                ),
              )}

              {busy && !messages.some((m) => m.tooling && !m.content) && (
                <div className="msg-in relative pl-3.5">
                  <span className="absolute bottom-0 left-0 top-0 w-[3px] bg-express/40" aria-hidden />
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                    the oracle is thinking
                    <span className="think-dot">■</span>
                    <span className="think-dot">■</span>
                    <span className="think-dot">■</span>
                  </span>
                </div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex gap-2 border-t border-ink/15 p-3"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={ready ? "Where should I work?" : "connecting to the network…"}
                disabled={!ready || busy}
                className="flex-1 border border-ink/30 bg-cream px-3 py-2 text-ink text-sm focus:border-ink focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!ready || busy || !input.trim()}
                className="bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-cream transition-colors hover:bg-ink/90 disabled:opacity-40"
              >
                Ask
              </button>
            </form>
          </div>
        </div>
    </>
  );
}
