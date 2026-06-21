/**
 * Morning Time CSV Sorter — Google Apps Script web app
 * =====================================================
 * Server side is intentionally tiny: it just serves Index.html. All CSV
 * parsing/sorting happens client-side in the browser (the file never leaves
 * the user's machine), which keeps this fast and avoids upload round-trips.
 *
 * Deploy:
 *   1. Create a new Apps Script project (script.google.com).
 *   2. Add this file as Code.gs and add an HTML file named exactly "Index"
 *      (paste in Index.html's contents). The editor shows it as "Index.html".
 *   3. Deploy > New deployment > Web app.
 *        - Execute as: Me
 *        - Who has access: choose what you need (e.g. "Only myself").
 *   4. Open the web app URL, upload the day's CSV, copy the tables.
 *
 * Note: Apps Script files are flat and looked up by exact name. If you push
 * this repo subfolder with clasp, set "rootDir": "morning-time-csv-sorter-gas"
 * in .clasp.json so the files land as "Code" / "Index" rather than
 * "morning-time-csv-sorter-gas/Code" / "...Index".
 */

function doGet() {
  // Look up the page by name. Depending on how the project was created
  // (pasted into the editor vs. pushed with a folder prefix via clasp), the
  // HTML file may be named "Index" or "morning-time-csv-sorter-gas/Index" —
  // try the likely names so doGet works either way.
  // No setXFrameOptionsMode() call: Apps Script's default already serves
  // X-Frame-Options: SAMEORIGIN (the enum only has DEFAULT and ALLOWALL),
  // which keeps same-origin-only framing and avoids clickjacking.
  var candidates = ['Index', 'morning-time-csv-sorter-gas/Index'];
  for (var i = 0; i < candidates.length; i++) {
    try {
      return HtmlService.createHtmlOutputFromFile(candidates[i])
        .setTitle('Morning Tip Sorter')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    } catch (err) {
      // Not found under this name; try the next candidate.
    }
  }
  throw new Error(
    'Could not find the page HTML. Add an HTML file named exactly "Index" ' +
    'to this Apps Script project (paste in Index.html).'
  );
}
