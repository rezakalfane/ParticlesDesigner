/** Removes the inline boot splash (see index.html) once the field is drawing. */
const MIN_VISIBLE_MS = 450; // long enough to read, counted from navigation start
const FADE_MS = 260; // keep in sync with the CSS transition
let dismissed = false;

export function dismissSplash(): void {
  if (dismissed) return;
  dismissed = true;
  const splash = document.getElementById("boot-splash");
  if (!splash) return;
  setTimeout(
    () => {
      splash.classList.add("done");
      setTimeout(() => splash.remove(), FADE_MS + 60);
    },
    Math.max(0, MIN_VISIBLE_MS - performance.now()),
  );
}

// Safety net: never leave the splash up if the first frame does not come (error, hidden tab).
setTimeout(dismissSplash, 12_000);
