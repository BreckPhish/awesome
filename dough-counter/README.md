# 🍕 Dough Counter

A tiny app for counting doughs across two restaurants and three storage
locations, then generating a copy-paste report.

There are two versions — use whichever you prefer:

- **`dough-counter.scriptable.js`** — for the iOS **Scriptable** app. Paste it
  into a new Scriptable script and run it. (Install steps are in a comment at
  the top of the file.)
- **`index.html`** — a self-contained web page that runs in any browser, phone
  or desktop, with no install.

Both produce the same report and use the same dough math.

## How to use (web version)

Open `index.html` in any browser — phone or desktop. No install, no internet
needed. To keep it one tap away on a phone, open it and use **"Add to Home
Screen"**. Counts are saved automatically in the browser, so they survive a
refresh until you hit **Reset**.

1. Enter the counts at each location with the **+ / −** buttons (or type a
   number directly).
2. The **Report** at the bottom updates live.
3. Tap **Copy text** and paste it wherever you need it.

## What goes where

| Location   | Inputs                                  |
|------------|-----------------------------------------|
| Location 1 | B1 doughs                               |
| Location 2 | A1 trays, A2 trays                      |
| Location 3 | A1 trays, A2 trays, B1 doughs, B2 tubs  |

- **A1** and **A2** are counted in **trays**: 1 A1 tray = **15** doughs,
  1 A2 tray = **8** doughs.
- **B1** and **B2** are counted **individually**.

## How totals are calculated

- **A1 total** = (Location 2 A1 trays + Location 3 A1 trays) × 15
- **A2 total** = (Location 2 A2 trays + Location 3 A2 trays) × 8
- **B1 total** = Location 1 B1 + Location 3 B1
- **B2 total** = Location 3 B2

## Report format

```
3D: <B1 total> + <B2 total> tubs
PF: <A1 total>
TP: <A2 total>
```

## Changing the numbers

If a tray ever holds a different number of doughs, edit the `DOUGHS_PER_TRAY`
values near the top of the `<script>` block in `index.html`.
