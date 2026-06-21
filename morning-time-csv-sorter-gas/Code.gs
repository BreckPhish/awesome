/**
 * Morning Time CSV Sorter — Google Apps Script web app
 * =====================================================
 * Server side is intentionally tiny: it just serves Index.html. All CSV
 * parsing/sorting happens client-side in the browser (the file never leaves
 * the user's machine), which keeps this fast and avoids upload round-trips.
 *
 * Deploy:
 *   1. Create a new Apps Script project (script.google.com).
 *   2. Add this file as Code.gs and add Index.html.
 *   3. Deploy > New deployment > Web app.
 *        - Execute as: Me
 *        - Who has access: choose what you need (e.g. "Only myself").
 *   4. Open the web app URL, upload the day's CSV, copy the tables.
 */

function doGet() {
  // No setXFrameOptionsMode() call: Apps Script's default already serves
  // X-Frame-Options: SAMEORIGIN, so external sites can't frame the app
  // (avoids clickjacking). The enum only has DEFAULT and ALLOWALL — there is
  // no SAMEORIGIN member — so relying on the default is the correct way to
  // keep same-origin-only framing.
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Morning Time CSV Sorter')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
