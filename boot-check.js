/**
 * Pre-flight check, loaded as a classic script.
 *
 * It cannot live inline (CSP is `script-src 'self'` with no 'unsafe-inline'), and
 * it cannot live in app.js either: app.js is an ES module, and the whole point of
 * this file is to report the one situation where modules never run at all —
 * opening the page from a file:// path, which browsers block for security. A
 * classic script still executes there, so this is the only place the message can
 * come from.
 */
(function () {
  if (location.protocol !== "file:") return;

  document.addEventListener("DOMContentLoaded", function () {
    var note = document.getElementById("testStatus");
    if (note) {
      note.textContent =
        "This page was opened from a file:// path, so the browser is blocking its modules and nothing will measure. Serve the folder over HTTP instead — for example `npx serve .` — and open the localhost URL it prints.";
    }
  });
})();
