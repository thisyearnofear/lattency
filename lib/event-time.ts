// Fixed UTC formatting: the board is rendered on the server, so pinning the
// timezone keeps the printed row identical when the client hydrates it.
const DAY_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});
const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export function formatEventStart(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${TIME_FMT.format(d)} · ${DAY_FMT.format(d)}`;
}
