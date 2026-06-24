// Dough Counter — for the iOS "Scriptable" app
// =============================================================================
// HOW TO INSTALL
//   1. Open the Scriptable app on your iPhone/iPad.
//   2. Tap the "+" (top-right) to create a new script.
//   3. Delete the placeholder text and paste this entire file in.
//   4. Tap the title at the top to rename it "Dough Counter" (optional).
//   5. Tap "Done", then tap the script to run it.
//
// HOW TO USE
//   - Tap any row to enter the count for that dough/tray at that location.
//   - The Report at the top updates as you go.
//   - Tap "Copy report" to put the text on your clipboard, ready to paste.
//   - Counts are saved automatically and remembered next time you run it.
//   - Tap "Reset all to 0" to start over.
//
// Tip: long-press the script in Scriptable and "Add to Home Screen" to launch
//      it like an app.
// =============================================================================

// ---- Configuration ----------------------------------------------------------
// Doughs per tray for the tray-counted types. Change these if a tray's
// capacity ever changes.
const DOUGHS_PER_TRAY = { a1: 15, a2: 8 };

// Every numeric field in the app, with where it lives and how it's counted.
//   unit "trays"      -> entered as trays, multiplied by DOUGHS_PER_TRAY
//   unit "doughs"     -> entered (and counted) individually
const FIELDS = [
  { key: "loc1_b1", location: 1, type: "B1", unit: "doughs" },
  { key: "loc2_a1", location: 2, type: "A1", unit: "trays" },
  { key: "loc2_a2", location: 2, type: "A2", unit: "trays" },
  { key: "loc3_a1", location: 3, type: "A1", unit: "trays" },
  { key: "loc3_a2", location: 3, type: "A2", unit: "trays" },
  { key: "loc3_b1", location: 3, type: "B1", unit: "doughs" },
  { key: "loc3_b2", location: 3, type: "B2", unit: "doughs" },
];

const STORAGE_KEY = "doughCounter.v1";

// ---- State (persisted with Keychain) ----------------------------------------
function blankState() {
  const s = {};
  for (const f of FIELDS) s[f.key] = 0;
  return s;
}

function loadState() {
  const blank = blankState();
  if (Keychain.contains(STORAGE_KEY)) {
    try {
      return { ...blank, ...JSON.parse(Keychain.get(STORAGE_KEY)) };
    } catch (e) {
      return blank;
    }
  }
  return blank;
}

function saveState() {
  Keychain.set(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

// ---- Totals & report --------------------------------------------------------
function doughsFor(field) {
  const count = state[field.key];
  if (field.unit === "trays") {
    return count * DOUGHS_PER_TRAY[field.type.toLowerCase()];
  }
  return count;
}

function compute() {
  const a1 = (state.loc2_a1 + state.loc3_a1) * DOUGHS_PER_TRAY.a1;
  const a2 = (state.loc2_a2 + state.loc3_a2) * DOUGHS_PER_TRAY.a2;
  const b1 = state.loc1_b1 + state.loc3_b1;
  const b2 = state.loc3_b2;
  return { a1, a2, b1, b2 };
}

function buildReport(t) {
  return (
    "3D: " + t.b1 + " + " + t.b2 + " tubs\n" +
    "PF: " + t.a1 + "\n" +
    "TP: " + t.a2
  );
}

// ---- Input prompt -----------------------------------------------------------
async function promptNumber(title, message, current) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  const tf = a.addTextField("0", String(current));
  tf.setNumberPadKeyboard();
  a.addAction("Save");
  a.addCancelAction("Cancel");
  const idx = await a.present();
  if (idx === -1) return null; // cancelled
  const v = parseInt(a.textFieldValue(0), 10);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

async function confirm(title, message) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addDestructiveAction("Reset");
  a.addCancelAction("Cancel");
  const idx = await a.present();
  return idx === 0;
}

// ---- UI ---------------------------------------------------------------------
const table = new UITable();
table.showSeparators = true;

function rebuild() {
  table.removeAllRows();
  buildRows();
  table.reload();
}

function addTitleRow() {
  const r = new UITableRow();
  r.height = 50;
  const c = r.addText("🍕 Dough Counter");
  c.titleFont = Font.boldSystemFont(22);
  table.addRow(r);
}

function addReportRow() {
  const t = compute();
  const r = new UITableRow();
  r.height = 120;
  const c = r.addText("Report", buildReport(t));
  c.titleFont = Font.mediumSystemFont(13);
  c.titleColor = Color.gray();
  c.subtitleFont = new Font("Menlo", 16);
  table.addRow(r);
}

function addHeaderRow(text) {
  const r = new UITableRow();
  r.isHeader = true;
  r.backgroundColor = new Color("#efe7dd");
  const c = r.addText(text);
  c.titleFont = Font.boldSystemFont(15);
  table.addRow(r);
}

function addFieldRow(field) {
  const r = new UITableRow();
  r.height = 56;
  r.dismissOnSelect = false;

  let label = field.type;
  let sub;
  if (field.unit === "trays") {
    const per = DOUGHS_PER_TRAY[field.type.toLowerCase()];
    sub = state[field.key] + " trays × " + per + " = " + doughsFor(field) + " doughs";
  } else {
    sub = doughsFor(field) + (field.type === "B2" ? " tubs" : " doughs");
  }

  const left = r.addText(label, sub);
  left.widthWeight = 72;
  left.titleFont = Font.semiboldSystemFont(17);
  left.subtitleColor = Color.gray();

  const valueText = field.unit === "trays"
    ? state[field.key] + " trays"
    : String(state[field.key]);
  const right = r.addText(valueText);
  right.widthWeight = 28;
  right.rightAligned();
  right.titleFont = Font.boldSystemFont(18);

  r.onSelect = async () => {
    const unitWord = field.unit === "trays" ? "trays" : "doughs";
    const v = await promptNumber(
      "Location " + field.location + " — " + field.type,
      "Enter number of " + unitWord,
      state[field.key]
    );
    if (v !== null) {
      state[field.key] = v;
      saveState();
      rebuild();
    }
  };

  table.addRow(r);
}

function addActionRow(label, color, handler) {
  const r = new UITableRow();
  r.height = 50;
  r.dismissOnSelect = false;
  const c = r.addText(label);
  c.titleColor = color;
  c.titleFont = Font.boldSystemFont(17);
  c.centerAligned();
  r.onSelect = handler;
  table.addRow(r);
}

function buildRows() {
  addTitleRow();
  addReportRow();

  // Group fields by location, in order.
  const locations = [...new Set(FIELDS.map(f => f.location))];
  for (const loc of locations) {
    addHeaderRow("Location " + loc);
    for (const field of FIELDS.filter(f => f.location === loc)) {
      addFieldRow(field);
    }
  }

  addActionRow("📋  Copy report", Color.blue(), async () => {
    Pasteboard.copy(buildReport(compute()));
    const a = new Alert();
    a.title = "Copied ✓";
    a.message = buildReport(compute());
    a.addAction("OK");
    await a.present();
  });

  addActionRow("Reset all to 0", Color.red(), async () => {
    const ok = await confirm("Reset?", "Set every count back to 0.");
    if (ok) {
      state = blankState();
      saveState();
      rebuild();
    }
  });
}

buildRows();
await table.present();

// When run from a widget/shortcut without UI, you could instead do:
//   Pasteboard.copy(buildReport(compute()));
