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
//   - The Report at the bottom updates as you go.
//   - Tap "Copy report" to put the text on your clipboard, ready to paste.
//   - Counts are saved automatically and remembered next time you run it.
//   - Tap "Reset all to 0" to start over.
//
// Tip: long-press the script in Scriptable and "Add to Home Screen" to launch
//      it like an app.
// =============================================================================

// ---- Configuration ----------------------------------------------------------
// Doughs per tray for the tray-counted types.
const DOUGHS_PER_TRAY = { pf: 15, tp: 8 };

const LOCATION_NAMES = {
  1: "3D Kitchen",
  2: "Tin Plate Kitchen",
  3: "Downstairs Bakery",
};

// Every numeric field in the app, with where it lives and how it's counted.
//   unit "trays"      -> entered as trays, multiplied by DOUGHS_PER_TRAY
//   unit "doughs"     -> entered and counted individually
//   unit "tubs"       -> entered and counted as tubs
const FIELDS = [
  { key: "loc1_3d_fridge1", location: 1, type: "3D Fridge 1", unit: "doughs" },
  { key: "loc1_3d_fridge2", location: 1, type: "3D Fridge 2", unit: "doughs" },

  { key: "loc2_pf", location: 2, type: "PF", unit: "trays" },
  { key: "loc2_tp", location: 2, type: "TP", unit: "trays" },

  { key: "loc3_pf", location: 3, type: "PF", unit: "trays" },
  { key: "loc3_tp", location: 3, type: "TP", unit: "trays" },
  { key: "loc3_3d", location: 3, type: "3D", unit: "doughs" },
  { key: "loc3_tubs", location: 3, type: "Tubs", unit: "tubs" },
];

const STORAGE_KEY = "doughCounter.v3";
const OLD_STORAGE_KEY_V2 = "doughCounter.v2";
const OLD_STORAGE_KEY_V1 = "doughCounter.v1";

// ---- State persisted with Keychain ------------------------------------------
function blankState() {
  const s = {};
  for (const f of FIELDS) s[f.key] = 0;
  return s;
}

function migrateV2State(oldState) {
  return {
    // Previous single 3D Kitchen value goes into Fridge 1.
    // Fridge 2 starts at 0.
    loc1_3d_fridge1: oldState.loc1_3d || 0,
    loc1_3d_fridge2: 0,

    loc2_pf: oldState.loc2_pf || 0,
    loc2_tp: oldState.loc2_tp || 0,
    loc3_pf: oldState.loc3_pf || 0,
    loc3_tp: oldState.loc3_tp || 0,
    loc3_3d: oldState.loc3_3d || 0,
    loc3_tubs: oldState.loc3_tubs || 0,
  };
}

function migrateV1State(oldState) {
  return {
    // Previous single B1 value goes into Fridge 1.
    // Fridge 2 starts at 0.
    loc1_3d_fridge1: oldState.loc1_b1 || 0,
    loc1_3d_fridge2: 0,

    loc2_pf: oldState.loc2_a1 || 0,
    loc2_tp: oldState.loc2_a2 || 0,
    loc3_pf: oldState.loc3_a1 || 0,
    loc3_tp: oldState.loc3_a2 || 0,
    loc3_3d: oldState.loc3_b1 || 0,
    loc3_tubs: oldState.loc3_b2 || 0,
  };
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

  // One-time migration from the previous PF/TP/3D/Tubs version.
  if (Keychain.contains(OLD_STORAGE_KEY_V2)) {
    try {
      const oldState = JSON.parse(Keychain.get(OLD_STORAGE_KEY_V2));
      const migrated = { ...blank, ...migrateV2State(oldState) };
      Keychain.set(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    } catch (e) {
      return blank;
    }
  }

  // One-time migration from the original A1/A2/B1/B2 version.
  if (Keychain.contains(OLD_STORAGE_KEY_V1)) {
    try {
      const oldState = JSON.parse(Keychain.get(OLD_STORAGE_KEY_V1));
      const migrated = { ...blank, ...migrateV1State(oldState) };
      Keychain.set(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
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
  const threeDKitchen =
    state.loc1_3d_fridge1 +
    state.loc1_3d_fridge2;

  const pf =
    (state.loc2_pf + state.loc3_pf) *
    DOUGHS_PER_TRAY.pf;

  const tp =
    (state.loc2_tp + state.loc3_tp) *
    DOUGHS_PER_TRAY.tp;

  const threeD =
    threeDKitchen +
    state.loc3_3d;

  const tubs = state.loc3_tubs;

  return {
    threeDKitchen,
    pf,
    tp,
    threeD,
    tubs,
  };
}

function buildReport(t) {
  return (
    "3D: " + t.threeD + " + " + t.tubs + " tubs\n" +
    "PF: " + t.pf + "\n" +
    "TP: " + t.tp
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
  if (idx === -1) return null;

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
  r.height = 44;
  r.backgroundColor = new Color("#d9ecff"); // light blue

  const c = r.addText(text);
  c.titleFont = Font.boldSystemFont(20);
  c.titleColor = new Color("#4a4a4a"); // dark gray

  table.addRow(r);
}

function addFieldRow(field) {
  const r = new UITableRow();
  r.height = 56;
  r.dismissOnSelect = false;

  const label = field.type;
  let sub;

  if (field.unit === "trays") {
    const per = DOUGHS_PER_TRAY[field.type.toLowerCase()];
    sub = state[field.key] + " trays × " + per + " = " + doughsFor(field) + " doughs";
  } else if (field.unit === "tubs") {
    sub = doughsFor(field) + " tubs";
  } else {
    sub = doughsFor(field) + " doughs";
  }

  const left = r.addText(label, sub);
  left.widthWeight = 72;
  left.titleFont = Font.semiboldSystemFont(17);
  left.subtitleColor = Color.gray();

  let valueText;
  if (field.unit === "trays") {
    valueText = state[field.key] + " trays";
  } else if (field.unit === "tubs") {
    valueText = state[field.key] + " tubs";
  } else {
    valueText = String(state[field.key]);
  }

  const right = r.addText(valueText);
  right.widthWeight = 28;
  right.rightAligned();
  right.titleFont = Font.boldSystemFont(18);

  r.onSelect = async () => {
    let unitWord;

    if (field.unit === "trays") {
      unitWord = "trays";
    } else if (field.unit === "tubs") {
      unitWord = "tubs";
    } else {
      unitWord = "doughs";
    }

    const v = await promptNumber(
      LOCATION_NAMES[field.location] + " — " + field.type,
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

  const locations = [...new Set(FIELDS.map(f => f.location))];

  for (const loc of locations) {
    addHeaderRow(LOCATION_NAMES[loc]);

    for (const field of FIELDS.filter(f => f.location === loc)) {
      addFieldRow(field);
    }
  }

  // Report is at the bottom, below all location sections.
  addReportRow();

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
