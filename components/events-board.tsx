import { getEvents } from "@/lib/events";
import { formatEventStart } from "@/lib/event-time";
import type { CafeStation } from "@/lib/types";
import { EventSubmitLauncher } from "./event-submit-launcher";

export async function EventsBoard({
  city,
  cityName,
  cafes,
}: {
  city: string;
  cityName: string;
  cafes: CafeStation[];
}) {
  const events = await getEvents({ city });
  const nameFor = new Map(cafes.map((c) => [c.id, c.name]));
  const venues = cafes.map((c) => ({ id: c.id, name: c.name }));

  return (
    <section
      id="events"
      className="mt-16 scroll-mt-20 border border-ink/80 bg-cream shadow-[3px_4px_0_0_var(--color-ink)]"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink/40 px-5 py-4">
        <div>
          <p className="stamp">Open venue &amp; events board</p>
          <h2 className="font-display font-black uppercase text-3xl md:text-4xl tracking-[-0.02em] text-ink mt-1">
            What&rsquo;s on in {cityName}
          </h2>
        </div>
        <p className="font-serif italic text-ink-soft text-sm max-w-xs">
          Organisers submit. The board publishes only what has been approved.
        </p>
      </header>

      {events.length === 0 ? (
        <p className="px-5 py-8 font-mono text-[11px] tracking-[0.2em] uppercase text-ink-faint">
          Nothing scheduled on this board yet.
        </p>
      ) : (
        <ul className="divide-y divide-ink/20">
          {events.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-[auto_1fr] md:grid-cols-[7rem_1fr_auto] gap-x-4 gap-y-1 px-5 py-3.5 items-baseline"
            >
              <span className="font-mono text-[13px] tracking-[0.12em] uppercase text-express">
                {formatEventStart(e.startsAt)}
                <span className="text-ink-faint"> UTC</span>
              </span>
              <span className="min-w-0">
                <span className="font-display font-black uppercase text-lg leading-tight text-ink block">
                  {e.title}
                </span>
                <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft">
                  {nameFor.get(e.venueId) ?? "Venue pending"}
                  {e.communityName ? ` · ${e.communityName}` : ""}
                </span>
              </span>
              {e.link ? (
                <a
                  href={e.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink hover:text-express transition-colors"
                >
                  RSVP →
                </a>
              ) : (
                <span aria-hidden />
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-ink/40 px-5 py-5">
        <EventSubmitLauncher city={city} cityName={cityName} venues={venues} />
      </div>
    </section>
  );
}
