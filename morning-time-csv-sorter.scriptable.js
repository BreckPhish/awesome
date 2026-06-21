// Morning Time CSV Sorter — Scriptable (iOS) version
// =====================================================
// Drop this whole file into the Scriptable app as a new script
// (e.g. "Morning Time CSV Sorter"). Run it on your iPhone.
//
// What changed vs. the p5.js Web Editor version:
//   * No DOM / p5.js. Scriptable has no `document`, `window`, file <input>,
//     or `navigator.clipboard`, so those pieces are replaced with native APIs:
//       - CSV input  -> DocumentPicker (pick a .csv) or paste from clipboard
//       - Display     -> a WebView showing the same styled tables (read-only)
//       - Copy        -> Pasteboard.copy() via a native action menu
//   * All of the actual sorting/QA logic is unchanged plain JavaScript.
//
// Typical flow: run the script -> choose how to load the CSV -> review the
// QA totals + tables in the WebView -> pick what to copy from the menu ->
// paste into your master spreadsheets.

// ----------------------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------------------

// 2:00 PM cutoff used to split Table 2 into lunch / dinner.
const TWO_PM_MINUTES = 14 * 60;

await main();

async function main() {
  try {
    const text = await loadCSVText();
    if (text === null) return; // user cancelled

    const processed = processCSV(text);
    await showResults(processed);
  } catch (err) {
    console.error(err);
    const a = new Alert();
    a.title = "Could not process CSV";
    a.message = (err && err.message) ? err.message : String(err);
    a.addCancelAction("OK");
    await a.present();
  }
}

// ----------------------------------------------------------------------------
// CSV input (replaces the browser file <input>)
// ----------------------------------------------------------------------------

async function loadCSVText() {
  const menu = new Alert();
  menu.title = "Morning Time CSV Sorter";
  menu.message = "How do you want to load today's CSV?";
  menu.addAction("Pick a CSV file");        // index 0
  menu.addAction("Paste from clipboard");   // index 1
  menu.addCancelAction("Cancel");           // -1

  const choice = await menu.present();

  if (choice === 0) {
    // DocumentPicker returns an array of file paths.
    let paths;
    try {
      paths = await DocumentPicker.open(["public.comma-separated-values-text", "public.text", "public.plain-text"]);
    } catch (e) {
      // User cancelled the picker.
      return null;
    }
    if (!paths || !paths.length) return null;

    const fm = FileManager.iCloud();
    const path = paths[0];
    // Make sure the file is materialised if it lives in iCloud Drive.
    if (fm.isFileStoredIniCloud(path) && !fm.isFileDownloaded(path)) {
      await fm.downloadFileFromiCloud(path);
    }
    return fm.readString(path);
  }

  if (choice === 1) {
    const clip = Pasteboard.paste();
    if (!clip || !String(clip).trim()) {
      const a = new Alert();
      a.title = "Clipboard is empty";
      a.message = "Copy the CSV text first, then run the script again.";
      a.addCancelAction("OK");
      await a.present();
      return null;
    }
    return String(clip);
  }

  return null; // cancelled
}

// ----------------------------------------------------------------------------
// Top-level CSV processing (mirrors processCSV from the original)
// ----------------------------------------------------------------------------

function processCSV(text) {
  const rows = parseCSV(String(text || ""));
  if (rows.length < 2) throw new Error("The CSV has no data rows.");

  const headers = rows[0].map(cleanHeader);
  validateRequiredColumns(headers);

  const body = rows.slice(1)
    .filter(function (row) {
      return row.some(function (cell) {
        return String(cell || "").trim() !== "";
      });
    })
    .map(function (row) {
      return rowObject(headers, row);
    });

  const result = buildTables(body);
  result.loadedRows = body.length;
  return result;
}

function validateRequiredColumns(headers) {
  const required = ["Employee", "Job", "Time In", "Time Out"];
  const missing = required.filter(function (header) {
    return !headers.includes(header);
  });

  const hasHours = headers.includes("Payable Hours") || headers.includes("Total Hours");

  if (missing.length) {
    throw new Error("Missing required column(s): " + missing.join(", "));
  }

  if (!hasHours) {
    throw new Error("Missing required hours column: Payable Hours or Total Hours.");
  }
}

function emptyResults() {
  return {
    table1: [],
    table2: [],
    table2SplitIndex: 0,
    unmatched: [],
    excluded: [],
    sourceHours: 0,
    excludedHours: 0,
    sourceRows: 0
  };
}

// ----------------------------------------------------------------------------
// Sorting logic — unchanged from the p5.js version
// ----------------------------------------------------------------------------

function buildTables(rows) {
  const table1Map = new Map();
  const table2 = [];
  const unmatched = [];
  const excluded = [];
  let excludedHours = 0;

  rows.forEach(function (row) {
    if (isAlwaysExcluded(row)) {
      const hours = getHours(row);
      excludedHours += hours;
      excluded.push({
        "Employee": get(row, "Employee"),
        "Job": get(row, "Job"),
        "Payable Hours": formatHours(hours),
        "Clock In": get(row, "Time In"),
        "Clock Out": get(row, "Time Out")
      });
      return;
    }

    const inTable1 = includeTable1(row);
    const inTable2 = includeTable2(row);

    if (inTable1) addTable1Row(table1Map, row);
    if (inTable2) addTable2Row(table2, row);

    if (!inTable1 && !inTable2) {
      unmatched.push({
        "Employee": get(row, "Employee"),
        "Job": get(row, "Job"),
        "Payable Hours": formatHours(getHours(row)),
        "Clock In": get(row, "Time In"),
        "Clock Out": get(row, "Time Out")
      });
    }
  });

  const table1 = Array.from(table1Map.values())
    .map(function (item) {
      return {
        "NAMES": item.name,
        "TOTAL HOURS": formatHours(item.hours),
        "JOB TITLE": Array.from(item.jobs).join(" / "),
        "_is3D": item.is3D
      };
    })
    .sort(function (a, b) {
      if (a._is3D !== b._is3D) return a._is3D ? -1 : 1;
      return a["NAMES"].localeCompare(b["NAMES"]);
    })
    .map(function (row) {
      return {
        "NAMES": row["NAMES"],
        "TOTAL HOURS": row["TOTAL HOURS"],
        "JOB TITLE": row["JOB TITLE"]
      };
    });

  table2.sort(function (a, b) {
    return a._sort - b._sort;
  });

  // Everyone who clocked in before 2:00 PM sorts above the gap; everyone at or
  // after 2:00 PM (and any unparseable times) falls below it.
  const splitIndex = table2.filter(function (row) {
    return row._sort < TWO_PM_MINUTES;
  }).length;

  const visibleTable2 = table2.map(function (row) {
    return {
      "FIRST NAMES": row["FIRST NAMES"],
      "TOTAL HOURS": row["TOTAL HOURS"],
      "CLOCK IN TIME": row["CLOCK IN TIME"],
      "CLOCK OUT TIME": row["CLOCK OUT TIME"],
      "JOB TITLE": row["JOB TITLE"]
    };
  });

  const sourceHours = rows.reduce(function (sum, row) {
    return sum + getHours(row);
  }, 0);

  return {
    table1: table1,
    table2: visibleTable2,
    table2SplitIndex: splitIndex,
    unmatched: unmatched,
    excluded: excluded,
    sourceHours: sourceHours,
    excludedHours: excludedHours,
    sourceRows: rows.length
  };
}

function addTable1Row(map, row) {
  const is3D = isThreeDaughters(row);
  const first = firstName(get(row, "Employee"));
  const name = first + (is3D && !/\s3D$/i.test(first) ? " 3D" : "");
  const key = name.toLowerCase();
  const hours = getHours(row);
  const job = cleanJobTitle(get(row, "Job"));

  if (!map.has(key)) {
    map.set(key, {
      name: name,
      hours: 0,
      jobs: new Set(),
      is3D: is3D
    });
  }

  const item = map.get(key);
  item.hours += hours;
  item.is3D = item.is3D || is3D;
  if (job) item.jobs.add(job);
}

function addTable2Row(table2, row) {
  table2.push({
    "FIRST NAMES": firstName(get(row, "Employee")),
    "TOTAL HOURS": formatHours(getHours(row)),
    "CLOCK IN TIME": get(row, "Time In"),
    "CLOCK OUT TIME": get(row, "Time Out"),
    "JOB TITLE": cleanJobTitle(get(row, "Job")),
    "_sort": timeToMinutes(get(row, "Time In"))
  });
}

// Profiles that should never reach any table: the ghost "Three Daughters"
// employee profile, online ordering, Toast default profiles, hosts, managers
// (incl. hourly shift manager), and chefs.
function isAlwaysExcluded(row) {
  const job = get(row, "Job");
  const employee = get(row, "Employee");
  const hay = job + " " + employee;

  return /three\s*daughters/i.test(employee)
    || /online\s*order(ing)?/i.test(hay)
    || /toast\s*default/i.test(hay)
    || /\bdefault\b/i.test(job)
    || /\bhost(ess)?\b/i.test(job)
    || /\bmanager\b/i.test(job)
    || /\bchef\b/i.test(job);
}

function includeTable1(row) {
  const job = get(row, "Job");

  return isThreeDaughters(row)
    || /\bbusser\b/i.test(job)
    || /\bdishwasher\b/i.test(job)
    || /\bprep\s*cook\b/i.test(job)
    || /\bcook\b/i.test(job);
}

function includeTable2(row) {
  const job = get(row, "Job");

  if (/\btrainee\b/i.test(job)) return false;

  return /\bserver\b/i.test(job)
    || /\bbartender\b/i.test(job)
    || /\bbar\s*lead\b/i.test(job)
    || /\btrainer\b/i.test(job);
}

function isThreeDaughters(row) {
  return /three daughters/i.test(get(row, "Employee"))
    || /\b3d\b/i.test(get(row, "Job"))
    || /three daughters/i.test(get(row, "Location"));
}

function firstName(employee) {
  const raw = String(employee || "").trim();
  if (!raw) return "";

  if (/three daughters/i.test(raw)) return "Three Daughters";

  if (raw.includes(",")) {
    const afterComma = raw.split(",").slice(1).join(",").trim();
    return titleCase((afterComma.split(/\s+/)[0] || "").trim());
  }

  return titleCase((raw.split(/\s+/)[0] || "").trim());
}

function cleanJobTitle(job) {
  const raw = String(job || "").trim();
  if (!raw) return "";

  const noDept = raw.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();

  if (/\bbusser\b/i.test(noDept)) return "Busser";
  if (/\bdishwasher\b/i.test(noDept)) return "Dishwasher";
  if (/\bprep\s*cook\b/i.test(noDept)) return "Prep Cook";
  if (/\b3d\s*cook\b/i.test(noDept)) return "3D Cook";
  if (/\bcook\b/i.test(noDept)) return "Cook";
  if (/\bbartender\b/i.test(noDept)) return "Bartender";
  if (/\bbar\s*lead\b/i.test(noDept)) return "Bar Lead";
  if (/\bserver\b/i.test(noDept)) return "Server";
  if (/\btrainer\b/i.test(noDept)) return "Trainer";

  return titleCase(noDept);
}

function getHours(row) {
  const payable = get(row, "Payable Hours");
  const total = get(row, "Total Hours");
  const value = payable !== "" ? payable : total;
  const parsed = parseFloat(String(value || "0").replace(/,/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatHours(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function timeToMinutes(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);

  if (!match) return 99999;

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 99999;

  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  return hour * 60 + minute;
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .split(/([\s-]+)/)
    .map(function (part) {
      return /^[a-z]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part;
    })
    .join("");
}

function cleanHeader(header) {
  return String(header || "").replace(/^﻿/, "").trim();
}

function rowObject(headers, values) {
  const obj = {};

  headers.forEach(function (header, index) {
    obj[header] = String(values[index] === undefined ? "" : values[index]).trim();
  });

  return obj;
}

function get(row, key) {
  if (row[key] !== undefined) return row[key];

  const found = Object.keys(row).find(function (k) {
    return k.toLowerCase() === key.toLowerCase();
  });

  return found ? row[found] : "";
}

// ----------------------------------------------------------------------------
// QA + TSV helpers (unchanged math; no DOM)
// ----------------------------------------------------------------------------

function computeQA(processed) {
  const sourceHours = Number(processed.sourceHours || 0);
  const table1Hours = sumColumn(processed.table1, "TOTAL HOURS");
  const table2Hours = sumColumn(processed.table2, "TOTAL HOURS");
  const unmatchedHours = sumColumn(processed.unmatched, "Payable Hours");
  const excludedHours = Number(processed.excludedHours || 0);
  const checkTotal = table1Hours + table2Hours + unmatchedHours + excludedHours;
  const delta = Math.abs(sourceHours - checkTotal);

  return {
    sourceRows: processed.loadedRows || 0,
    sourceHours: sourceHours,
    table1Hours: table1Hours,
    table2Hours: table2Hours,
    unmatchedHours: unmatchedHours,
    excludedHours: excludedHours,
    checkTotal: checkTotal,
    delta: delta,
    passed: delta < 0.01
  };
}

function sumColumn(rows, key) {
  return rows.reduce(function (sum, row) {
    const n = parseFloat(String(row[key] || "0").replace(/,/g, ""));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function toTSV(rows, includeHeaders) {
  if (!rows.length) return "";

  const headers = Object.keys(rows[0]);
  const lines = [];

  if (includeHeaders) lines.push(headers.join("\t"));

  rows.forEach(function (row) {
    lines.push(headers.map(function (header) {
      return cleanCell(row[header]);
    }).join("\t"));
  });

  return lines.join("\n");
}

// Table 2 TSV: inserts a blank gap row at the 2:00 PM split so the pasted block
// keeps the same before/after (lunch/dinner) separation as the on-screen table.
function toTSV2(rows, splitIndex, includeHeaders) {
  if (!rows.length) return "";

  const headers = Object.keys(rows[0]);
  const showGap = splitIndex > 0 && splitIndex < rows.length;
  const lines = [];

  if (includeHeaders) lines.push(headers.join("\t"));

  rows.forEach(function (row, index) {
    if (showGap && index === splitIndex) lines.push("");
    lines.push(headers.map(function (header) {
      return cleanCell(row[header]);
    }).join("\t"));
  });

  return lines.join("\n");
}

function cleanCell(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ");
}

// ----------------------------------------------------------------------------
// CSV parser — unchanged from the p5.js version
// ----------------------------------------------------------------------------

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

// ----------------------------------------------------------------------------
// Output: WebView display (read-only) + native copy menu
// ----------------------------------------------------------------------------

async function showResults(processed) {
  const qa = computeQA(processed);

  // Show the styled tables in a WebView so you can eyeball everything,
  // then drop back into a native menu to copy.
  await presentWebView(processed, qa);
  await copyMenu(processed, qa);
}

async function presentWebView(processed, qa) {
  const wv = new WebView();
  await wv.loadHTML(buildHTML(processed, qa));
  await wv.present(true); // fullscreen
}

async function copyMenu(processed, qa) {
  while (true) {
    const menu = new Alert();
    menu.title = "Copy to clipboard";
    menu.message = qa.passed
      ? "QA passed. Pick what to copy, then paste into your spreadsheet."
      : "QA warning: totals differ by " + formatHours(qa.delta) + " h. Pick what to copy.";

    const split = processed.table2SplitIndex || 0;
    const amPool = processed.table2.slice(0, split);
    const pmPool = processed.table2.slice(split);

    // Each action returns the TSV text to copy. Table 2 is the FOH cash tip
    // pools: the AM pool (before 2 PM) and PM pool (2 PM & after) are
    // independent, so each can be copied on its own.
    const actions = [
      { label: "Table 1 — rows only", text: function () { return toTSV(processed.table1, false); } },
      { label: "Table 1 — with headers", text: function () { return toTSV(processed.table1, true); } },
      { label: "Table 2 — AM tip pool (before 2 PM)", text: function () { return toTSV(amPool, false); } },
      { label: "Table 2 — PM tip pool (2 PM & after)", text: function () { return toTSV(pmPool, false); } },
      { label: "Table 2 — both pools with headers", text: function () { return toTSV2(processed.table2, split, true); } },
      { label: "Unmatched — with headers", text: function () { return toTSV(processed.unmatched, true); } }
    ];

    actions.forEach(function (a) { menu.addAction(a.label); });
    menu.addAction("Show tables again");
    menu.addCancelAction("Done");

    const choice = await menu.present();

    if (choice === -1) return;

    if (choice === actions.length) {
      await presentWebView(processed, qa);
      continue;
    }

    const chosen = actions[choice];
    const text = chosen.text();

    if (!text) {
      await toast("Nothing to copy.");
      continue;
    }

    Pasteboard.copy(text);
    await toast(chosen.label + " copied.");
  }
}

async function toast(message) {
  const a = new Alert();
  a.title = message;
  a.addAction("OK");
  await a.present();
}

// ----------------------------------------------------------------------------
// HTML builder for the WebView (same look & feel as the web tool, read-only)
// ----------------------------------------------------------------------------

function buildHTML(processed, qa) {
  const qaCards = [
    ["Source rows", String(qa.sourceRows)],
    ["Source payable hours", formatHours(qa.sourceHours)],
    ["Table 1 hours", formatHours(qa.table1Hours)],
    ["Table 2 hours", formatHours(qa.table2Hours)],
    ["Unmatched hours", formatHours(qa.unmatchedHours)],
    ["Excluded hours", formatHours(qa.excludedHours)],
    ["Check total", formatHours(qa.checkTotal)]
  ].map(function (c) {
    return '<div class="qa-card"><div class="qa-label">' + escapeHTML(c[0]) +
      '</div><div class="qa-value">' + escapeHTML(c[1]) + '</div></div>';
  }).join("");

  const qaMessage = qa.passed
    ? '<div class="status good qa-message">QA passed: Table 1 + Table 2 + Unmatched + Excluded equals source payable hours.</div>'
    : '<div class="status warning qa-message">QA warning: totals differ by ' +
      escapeHTML(formatHours(qa.delta)) + ' hours. Review CSV columns, unmatched rows, and excluded rows.</div>';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    --bg:#f6f7f8; --panel:#fff; --ink:#202124; --muted:#5f6368; --line:#d8dce0;
    --accent:#1f6feb; --warn:#8a5a00; --bad:#9b1c1c; --good:#126b39;
  }
  * { box-sizing:border-box; -webkit-text-size-adjust:100%; }
  body { margin:0; padding:16px; background:var(--bg); color:var(--ink);
    font-family:-apple-system,system-ui,"Segoe UI",sans-serif; line-height:1.35; }
  h1 { margin:0 0 6px; font-size:22px; }
  h2 { margin:0 0 12px; font-size:18px; }
  h3 { margin:14px 0 10px; font-size:15px; }
  .muted { color:var(--muted); font-size:13px; }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:12px;
    padding:14px; margin:12px 0; box-shadow:0 1px 2px rgba(0,0,0,.04); }
  .status { padding:10px 12px; background:#eef5ff; border:1px solid #c9ddff;
    border-radius:10px; color:#174ea6; font-size:14px; }
  .warning { background:#fff8e1; border-color:#f2cf73; color:var(--warn); }
  .good { background:#eaf7ef; border-color:#b7e0c8; color:var(--good); }
  .qa-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; }
  .qa-card { border:1px solid var(--line); border-radius:10px; padding:10px; background:#fbfbfb; }
  .qa-label { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  .qa-value { margin-top:4px; font-size:19px; font-weight:750; font-variant-numeric:tabular-nums; }
  .qa-message { margin-top:12px; }
  table { width:100%; border-collapse:collapse; background:#fff; font-size:13px; }
  th, td { border:1px solid var(--line); padding:7px 8px; text-align:left; vertical-align:top; }
  th { background:#f1f3f4; font-weight:750; }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
  tr.gap-row td { background:#fff4d6; color:var(--warn); font-weight:750;
    text-align:center; letter-spacing:.03em; }
</style>
</head>
<body>
  <h1>Morning Time CSV Sorter</h1>
  <p class="muted">Loaded ${qa.sourceRows} rows. Review below, then copy from the menu.</p>

  <div class="panel">
    <h2>QA totals</h2>
    <div class="qa-grid">${qaCards}</div>
    ${qaMessage}
  </div>

  <div class="panel">
    <h2>Table 1 — BOH / bussers / 3D</h2>
    ${renderHTMLTable(processed.table1)}
  </div>

  <div class="panel">
    <h2>Table 2 — FOH cash tip pools</h2>
    <p class="muted">AM tip pool (clock-in before 2 PM) and PM tip pool (2 PM &amp; after) are independent — copy each into its own table.</p>
    ${renderHTMLTable2(processed.table2, processed.table2SplitIndex)}
  </div>

  <div class="panel">
    <h2>Unmatched rows</h2>
    <p class="muted">Rows that did not meet Table 1 or Table 2 rules. Excluded profiles are removed before this section.</p>
    ${renderHTMLTable(processed.unmatched)}
  </div>

  <div class="panel">
    <h2>Excluded rows</h2>
    <p class="muted">Online ordering, Toast default, Host, Manager, and Chef rows are shown only for QA and are not in either copy/paste table.</p>
    ${renderHTMLTable(processed.excluded)}
  </div>
</body>
</html>`;
}

function renderHTMLTable(rows) {
  if (!rows || !rows.length) return '<p class="muted">No rows.</p>';

  const headers = Object.keys(rows[0]);
  const thead = headers.map(function (h) {
    const cls = /hours/i.test(h) ? ' class="num"' : "";
    return "<th" + cls + ">" + escapeHTML(h) + "</th>";
  }).join("");

  const tbody = rows.map(function (row) {
    const tds = headers.map(function (h) {
      const cls = /hours/i.test(h) ? ' class="num"' : "";
      return "<td" + cls + ">" + escapeHTML(row[h]) + "</td>";
    }).join("");
    return "<tr>" + tds + "</tr>";
  }).join("");

  return "<table><thead><tr>" + thead + "</tr></thead><tbody>" + tbody + "</tbody></table>";
}

// Same as renderHTMLTable, but labels the AM tip pool (before 2 PM) and the
// PM tip pool (2 PM & after) as banner rows at the split.
function renderHTMLTable2(rows, splitIndex) {
  if (!rows || !rows.length) return '<p class="muted">No rows.</p>';

  const headers = Object.keys(rows[0]);

  const thead = headers.map(function (h) {
    const cls = /hours/i.test(h) ? ' class="num"' : "";
    return "<th" + cls + ">" + escapeHTML(h) + "</th>";
  }).join("");

  function poolLabel(text) {
    return '<tr class="gap-row"><td colspan="' + headers.length + '">' + text + "</td></tr>";
  }

  const tbody = rows.map(function (row, index) {
    const tds = headers.map(function (h) {
      const cls = /hours/i.test(h) ? ' class="num"' : "";
      return "<td" + cls + ">" + escapeHTML(row[h]) + "</td>";
    }).join("");

    let prefix = "";
    if (index === 0 && splitIndex > 0) prefix += poolLabel("AM TIP POOL — clock-in before 2:00 PM");
    if (index === splitIndex && splitIndex < rows.length) prefix += poolLabel("PM TIP POOL — clock-in 2:00 PM &amp; after");

    return prefix + "<tr>" + tds + "</tr>";
  }).join("");

  return "<table><thead><tr>" + thead + "</tr></thead><tbody>" + tbody + "</tbody></table>";
}

function escapeHTML(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
