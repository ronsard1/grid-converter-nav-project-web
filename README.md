# GridNav — grid converter and navigation exercise planner

**Developed by ASRAT**


An **Android app (APK)** that works fully **without internet**. It can also be opened as a web page on a computer.
Everything you make (maps, checkpoints, exercises) is saved **on your phone only**: no account, no cloud.

**Website:** https://ronsard1.github.io/grid-converter-nav-project-web/
**APK for your phone:** https://github.com/ronsard1/grid-converter-nav-project-web/releases/latest
**Phone app (Flutter version):** https://github.com/ronsard1/grid-converter-nav-project-moboapp

It does four jobs:

1. **Converts** grid references to latitude/longitude and back, accurately, using the map sheet you choose.
2. **Plans navigation exercises**: every syndicate starts at the same Index, visits its own set of checkpoints in its own order, covers about the same distance, and returns.
3. **Plans operation exercises**: each platoon is given a place and an operation (fighting patrol, ambush, raid …) and gets its own written order.
4. **Prints the papers** and runs a **control board** where each syndicate's next move lights up.

---

## 0. Getting the app, and updating it

This project is already on GitHub. Every time a change is pushed to `main`, GitHub does two things by itself (the instructions are in the `.github` folder):
- **Build Android APK**: makes a new APK and puts it on the **Releases** page (about 8–12 minutes).
- **Update website**: publishes the new version of the website (about 1 minute).

Watch them in the **Actions** tab: yellow = working, green ✓ = done, red ✗ = failed (open it and copy the red error lines). Only the **top** (newest) line matters; an old red ✗ further down was already fixed.

**Install on your phone:** open the APK link above on the phone → tap **GridNav-1.0.x.apk** → open the download → allow **Install unknown apps** once → **Install**. If *Play Protect* warns, tap *More details → Install anyway* (normal for apps not from the Play Store).

**Update after changing files on your computer** (VS Code terminal, inside this folder):
```
git add .
git commit -m "what you changed"
git push
```
Install the new APK **over** the old one. **Your data stays**, because every build is signed with the same key (`build/android/gridnav-test.keystore`). Don't uninstall first: that deletes the app's data. Save a backup if in doubt.

### Hidden files: what they are and how to see them
Files and folders whose name starts with a dot are "hidden" settings files. You don't need to open them, but they must stay in the folder:

| Name | What it does |
|---|---|
| `.github/workflows/build-apk.yml` | Tells GitHub how to build the APK |
| `.github/workflows/website.yml` | Tells GitHub to update the website after each push |
| `.gitignore` | Tells git which folders not to upload (`node_modules`, `www`, `android`, APK files) |
| `.nojekyll` | Tells GitHub Pages to show the files as they are |

How to see them:
- **Windows 11 File Explorer:** **View** (top bar) → **Show** → tick **Hidden items**.
- **Windows 10 File Explorer:** **View** tab (top ribbon) → tick **Hidden items** (right side).
- If you don't see **View**, press the **⋯** (See more) button or make the window wider.
- **VS Code:** open the folder (*File → Open Folder*); the Explorer on the left shows dot files.
- **On GitHub:** open the repository page; `.github` is listed at the top with the other folders.
- **Mac Finder:** press **Cmd + Shift + .** (dot).

**What the APK contains:** the whole app, the map library and the fonts, so it needs no internet. Only the photo/topo background map downloads tiles, and areas you've viewed stay available offline. The grid route map on the Exercise screen never needs internet.

**Your data and backups:** tap the **save icon** (top right) → *Share backup* (WhatsApp, email, Drive…) or *Save backup on this phone* (Documents/GridNav). On a new phone: install the app → save icon → *Restore from a backup file*. Do this regularly. If the phone is lost, only a backup brings your work back.

**Printing from the phone:** each Print button opens Android's print screen. Choose a printer (Wi-Fi printers, or apps like *HP Smart*), or **Save as PDF** and send the PDF to whoever prints it.

---

## 1. How to use it

### Step 1 — Add your map
**Maps → New map**

**Rwandan 1:50 000 sheets (like KANAZI):** choose **Rwanda national grid**, then the **district** where the sheet is (or press *I'm on this sheet now* to use GPS). You don't need any corner numbers.

The app then shows where the red lat/long labels on your sheet must fall. For example, on KANAZI: *30°10′E → easting 18.5, 2°15′S → northing 51.2*. Compare with your margin. If they match, every conversion on that sheet is exact.

**Burundi, DR Congo and other military (NATO) maps:** choose **UTM grid**. Pick a nearby town, type any lat/lon printed on the sheet, or press *I'm on this sheet now*. Then set the **datum** and **zone** printed in the margin. The zone is filled in automatically from the location if the margin doesn't show it. For example, the US-made Burundi 1:50 000 series (Z724) says *Universal Transverse Mercator grid, WGS 84*.

**Not sure which grid?** Choose **I'm not sure / local grid** and enter the bottom-left corner: its grid reference and the lat/lon printed there. The app tests that corner against TM Rwanda and the UTM zones and tells you which grid it found.

**How to recognise the grid from the margin:**
| Margin says | Choose |
|---|---|
| Rwandan sheet, "Datum: WGS 84", and 30°10′E falls near easting 18–19 | Rwanda national grid |
| "Universal Transverse Mercator grid", or "UTM zone 35" / "36" | UTM grid (set zone + datum) |
| "Arc 1960" or "Arc 1950" | UTM grid with that datum (older maps; about 300 m from GPS) |
| Nothing clear | I'm not sure: type the corner |

### Step 2 — Convert
At the top of **Convert**, choose the direction:
- **Grid → Geo:** type a grid reference (`214534`, also 4, 8 or 10 figures). You get the lat/lon in degrees-minutes-seconds, decimal and degrees-minutes.
- **Geo → Grid:** type the latitude and longitude in two boxes (`2 14 18.7 S` and `30 10 57.1 E`, or decimals). You get the 6, 8 and 10-figure grid. You can also press **My position** (GPS) or tap the map.

The conversion always uses the **map you have selected** (its name is at the top). Change maps by tapping that name.

### Step 3 — Register points
**Points → Add point**: give a number, a name, and the position (a grid or a lat/lon). "I'm standing here" uses the GPS. On a computer you can also click the map while on the Points screen.

Each point has **edit** (pencil) and **delete** (bin) buttons. If you delete a point an exercise uses, that exercise's routes are cleared so you can make new ones.

Register the **Index** (start point) and every place you may use as a checkpoint. The numbers you give here are the checkpoint numbers printed on every paper.

At the top of **Points**, choose the **Index (distances from)**. The list is then sorted **nearest first**, and each point shows its ground distance and bearing in mils from the Index. The map draws a dotted line from the Index to every point, with its km. *By number* switches back to number order.

### Step 4 — Plan the exercise
**Exercise** opens your **exercise history**: every exercise on this map, newest first, with its name, date, company, syndicates, km and status (Draft / Planned / In progress / Finished).
- Tap one to **open** it (to plan, print or follow it on the control board).
- **Copy** reuses an old exercise's settings with new routes.
- **Delete** removes it, with a confirmation first.

**New exercise:** choose **Navigation** (this step) or **Operation** (see *Operation exercise* below). Then give it a **name** (e.g. "Ex day navigation two").

- **Start point (Index)**: tap one point (orange).
- **Checkpoints in play**: tap the ones to use (blue).
- **Syndicates**, **Checkpoints per route**, **Distance (km)** and **Allowed ± (km)**, e.g. 20 syndicates, 6 checkpoints, 30 km ± 1 km.
- **Slip messages**: the text printed on the slips.

**Map of points and routes:** once the Index and checkpoints are chosen, a map appears, drawn on your sheet's own grid squares and numbers. It needs no internet. Open **Distances between points (km)** to see a table of the km between every pair of points.

Press **Make routes**. All syndicate routes are drawn together on the map. Choose a syndicate in **Show route of** (or tap its number, or its line on the map) to see its route alone: its checkpoints are numbered **CP1, CP2 … in the order it visits them**, like the leader summary, with an arrow and the km on each leg, and a list with the grid and bearing of each next checkpoint. **On map** opens it on the big map. Choose **All syndicates** to see every route again. Each card shows the route, e.g. `IX › 4 › 6 › 10 › 2 › 5 › 1 › IX`, with its distance. Tap the pencil to change a stage by hand; the distance updates as you change it.

### Operation exercise
**Exercise → New exercise → Operation.**
1. Name, intake, date and the **not later than** time (the same for all platoons).
2. **Companies** (named Alpha, Bravo, Charlie … ; rename them if you want) and **platoons per company** (3 by default). Platoon numbers run on (No 1–3 Alpha, No 4–6 Bravo) or restart at 1 in each company.
3. **Places of operation:** tick as many places as there are platoons, and choose the operation at each place. Places are points on the map (by grid or lat/lon); *Add a new place* adds one.
4. **Operation types** (fighting patrol, ambush, raid, dawn attack, recce patrol, patrol base, alternative patrol base) and their **mission words** can all be changed, and you can add your own.
5. **Order wording:** the sentence printed on each platoon's paper. The app fills in `{pl}` platoon number, `{coy}` company, `{op}` operation, `{task}` mission words, `{place}`, `{grid}`, `{latlon}`, `{time}`, `{date}`, `{intake}`. Example result: *No 2 Platoon is to destroy the enemy by conducting an ambush at grid 214 534 (2°13′49.3″ S 30°11′32.7″ E) not later than 0530 hrs on 14 Nov 26.*
6. **Assign platoons to places.** Each press gives a new draw: a platoon doesn't get the place it had last time, and platoons of one company get different kinds of operation when possible. Swap two platoons by hand with the list on each row.
7. **Print:** *Leader summary* (all platoons, places, grids, coordinates, time) and *Platoon orders* (one page per platoon, or 2 per page). Coordinates on the papers are GPS (WGS 84).

### Step 5 — Print
| Paper | Who gets it | What is on it |
|---|---|---|
| **Leader summary** | Leader / control room | Your unit's *Check points summary* layout: security marking, reference lines top right (Annex B to / Serial 1 / title / dated), then S/N · SP · CP 1 … CP 7 · CP 8 (End Ex) · KM. Every cell gives the place name and its GR. Read down the **CP 1** column to see where each syndicate goes first. Page 2 is the **register**: each checkpoint and which syndicates pass there. |
| **Syndicate slips** | Each syndicate has its **own page** | **One A4 page per syndicate, in one column of strips.** Cut across the dashed lines. Each strip says *Syndicate 3* and which **checkpoint** it is (*Start*, *Checkpoint 1*, *Checkpoint 2*…), then an encouraging message and the **mission**: the start strip gives *Your mission GR …*, each checkpoint strip gives *Next mission GR …*, and the last gives *Return home GR …*. A small *Place at: …* tells the instructor where to leave each strip. Strips shrink to fit when there are more checkpoints. |
| **Route maps** | Leader | Page 1: all routes on one grid map. Then 4 syndicates per page, each with its own route only, legs numbered with km, and the grids. |
| **Slips by checkpoint** | The person placing slips | The same slips sorted by place, one envelope per checkpoint. |
| **Syndicate cards** | Each syndicate carries one | Start grid and first grid, plus boxes to write the arrival time at each stage. |
| **Control board** | Control room | Status snapshot. Black boxes = next move, grey boxes = reached, with the time. |

**Slip messages** are yours to change (Exercise → Slip messages). The grid is always added under the message. You can write `{syn}` (syndicate number), `{cp}` (checkpoint number) and `{home}` (start point name), and the app fills them in. Example: `Well done, Syndicate {syn}! Keep up the good work.`

**Paper header** (Exercise → Paper header): security marking (e.g. `EX-SECRET`) and the reference lines (e.g. `Annex B to` / `Serial 1`). The exercise title and date print underneath, exactly like your unit's papers.


On a phone, "Print" lets you **save as PDF** and share it.

### Step 6 — Control board (during the exercise)
**Control → Start exercise**. When a syndicate reports arriving, press its **✓**. The app records the time, and that syndicate's next checkpoint lights up orange. Tap any box to see the grid, leg distance, bearing (degrees and mils). **↶** undoes a mistake.

*By checkpoint* view: for each checkpoint, which syndicates should arrive next and which have already passed. Useful for checkpoint marshals.

**Night mode** (moon button) turns the screen black with soft light text, and dims the background map.

---

## 2. How the conversion works (and why it is accurate)

**The old version** treated the map as a flat sheet where every 100 m step was the same number of seconds (`0.2 cm ÷ 18.5 cm × 5 minutes`). The earth is curved, so that error grows with distance from the corner (about **107 m** at 15 km). Every mistake in reading the corner was also copied into every result.

**Which grid do Rwandan sheets use?** Your KANAZI sheet's margin says *Datum: WGS 84*. Its grid numbers don't match UTM. Here is how the red lat/long labels fall on the grid:

| Red label | On the sheet | TM Rwanda | UTM 35 | UTM 36 |
|---|---|---|---|---|
| 30°10′E | ≈ 18.5 | **18.5** | 52.3 | 84.8 |
| 30°15′E | ≈ 27.8 | **27.8** | 61.6 | 94.1 |
| 2°10′S | ≈ 60.4 | **60.4** | 60.2 | 60.2 |
| 2°15′S | ≈ 51.2 | **51.2** | 50.9 | 51.0 |

So the sheet uses **Rwanda's national grid (TM Rwanda)**. It is a Transverse Mercator projection with its centre line on **30°E**, scale 0.9999, false easting 500 km and false northing 5 000 km, on WGS 84. That's why grid easting "00" sits on the 30°E line, and each km east of it adds 1.

**Why the scale (1:50 000) doesn't matter:** the grid is in real metres on the ground. Scale only decides how big it is printed (1 km = 2 cm at 1:50 000).

**Why the app still needs the district:** a grid reference like 214 534 keeps only the last digits inside a 100 km square, and Rwanda covers several squares. The district (or one GPS fix) tells the app which square. After that, the exact formula (Krüger series) converts with errors under 1 millimetre.

Other details it handles:
- **Precision of a reference**: a 6-figure grid is good to 100 m, 8-figure to 10 m, 10-figure to 1 m. A 4-figure grid names a whole 1 km square, so the app uses its centre.
- **Roll-over**: when the grid numbers pass 99 → 00 on a sheet, the app still knows which way you moved.
- **Datum**: older maps use **Arc 1960**, which sits about 290 m from GPS (WGS 84). The app converts between the two, so GPS positions and the satellite map line up with your paper map.
- **Distances** are measured on the grid, like your ruler on the map, then corrected for the grid's small scale error.
- **Bearings** are given as grid bearings in degrees and mils. Enter the **grid-magnetic angle** from the map margin (Maps → Advanced) and the app shows magnetic bearings too.
- When zoomed in, the screen map shows **your map's own 1 km grid lines with their numbers**, so the screen matches the paper.

## 3. How the route planner works

The goal: N syndicates, each visiting M of the K checkpoints, every route close to the target distance, no two routes the same, every route a **loop** (never walking back along its own track), and syndicates not **walking together**.

1. **Build many candidate routes.** Pick M checkpoints at random in random order, then repair the route with small changes (swap two stops, replace a stop, reverse part of it). A change is kept when it brings the route closer to the target distance, and, once the distance is close, also when it makes the route a cleaner loop. A route is kept when it is within the allowed ± (about 120 candidates per syndicate).
2. **Choose routes one at a time.** Each syndicate gets the candidate with the lowest *trouble score* against the routes already given out:

| Trouble | Weight |
|---|---|
| Distance away from the target | strong |
| **Walking back along its own track** (a leg running beside an earlier leg, opposite direction, within 400 m) | strong |
| **Walking together**: the same two legs in a row as another syndicate (A → B → C) | very strong |
| At the same checkpoint at about the same walked distance **and** going to the same next checkpoint | strong |
| Same first checkpoint as other syndicates (they'd leave the Index together) | strong |
| Sharp U-turn (next checkpoint almost straight back) | medium |
| A checkpoint used more than its fair share | medium |
| **Same route as in an earlier exercise** on this map (memory) | very strong |
| Meeting at a checkpoint by chance (speeds differ) | small: allowed |
| Sharing one leg | small |

3. **Different every time.** Each press of *Make routes* starts from a new random seed, and avoids the previous plan and the last 5 exercises on the same map. Same checkpoints and distance on another day give **new routes for each syndicate**.

There's no rule about where a route ends: the last checkpoint can be anywhere.

**Test with the E Coy checkpoints** (11 checkpoints, 20 syndicates, 7 each, 30 ± 1 km, average of 5 plans):

| | Before | After |
|---|---|---|
| Routes within 30 ± 1 km | 20 / 20 | 20 / 20 |
| Routes walking back on their own track | 6.2 | **0.4–0.6** |
| Pairs of syndicates sharing two legs in a row | 13.8 | **2.4–3** |
| Routes repeated from the previous plan | not checked | **0 of 20** |

With few checkpoints and many syndicates (here 140 visits over 11 places), some sharing can't be avoided. More checkpoints spread around the Index give cleaner, more varied routes.

## 3b. Offline

The APK works fully offline from the first time you open it: conversion, points, planning, the route map, printing, the control board and GPS. Only the photo/topo background map needs internet, to download new areas.

(The web version needs internet once, to load, and then works offline in that browser.)

## 4. Files

```
index.html             the app page
css/app.css            design (military day theme and black night mode)
js/geo.js              coordinate engine: TM Rwanda, UTM, datums (no screen code, easy to test)
js/routes.js           route planner
js/print.js            printed papers
js/store.js            saving on the device + backups
js/native.js           phone features in the APK: printing, saving/sharing files
js/app.js              screens
tests/                 checks for the engine and planner (run automatically on every build)
package.json, capacitor.config.json   APK build settings (Capacitor)
build/                 APK build helpers, Android print module, signing key for test builds
assets/                app icon
.github/workflows/build-apk.yml       GitHub's APK build instructions
.github/workflows/website.yml         publishes the website after every push
.gitignore, .nojekyll                 git and GitHub Pages settings
sw.js, manifest.webmanifest           offline support for the web version
```

The app itself is plain HTML, CSS and JavaScript, which is easy to read and change. Capacitor wraps it as an Android app, and Leaflet draws the background map.

## 5. Web version

The same files work as a website: https://ronsard1.github.io/grid-converter-nav-project-web/ (GitHub Pages, updated automatically after each push). Open it once with internet; it then works offline in that browser. Data is saved in that browser; use a backup file to move it to the phone and back.

## 6. Run the tests
```
node tests/geo.test.js
node tests/routes.test.js
```

For the web version: after you change any file, raise `VERSION` in `sw.js` so browsers pick up the new version. The APK doesn't need this.
