// Haptics — a single guarded call so pay-off moments (contribution landed,
// bounty claimed) land with a physical tap on devices that support it.
// Everywhere else this is a silent no-op.

export function haptic(ms = 10): void {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(ms);
    } catch {
      /* some browsers throw on rapid repeat — never let a buzz break a flow */
    }
  }
}
