<p align="center">
    <img src="docs/banner.png" alt="P1xp" width="820">
</p>

<p align="center">
    Get a complete and fun F1 experience, right from your PC!
</p>

<p align="center">
    <a href="https://github.com/starvulkan/P1xp/releases/latest"><b>Download →</b></a>
</p>

---

![Home](docs/screenshots/home_normal.png)

<sub>*Home menu*</sub>

---

![Live mode](docs/screenshots/raceLive_normal.png)

<sub>*Live session mode*</sub>

---

<h1>About!</h1>

P1xp provides you a unique way to experience Formula 1, right from your PC! P1xp provides race weekend schedules, countdown to each session, customization based on your favs, and a cool live session data displayer! 

## Why P1xp?

Apart from combining my favorite hobbies (programming and motorsport), I've always wanted to create a data displayer for F1 that's easy to use and to set up, and best of all, free to use. I've always found myself wanting more data during F1 sessions, to get a better understanding of what's going on. I hope you are able to find use and enjoyment in my silly little project, and can bring you a bit more fun in these troubled F1 times.

## Main features!

1. Countdown to the following session.
2. Race weekend schedule.
3. App theming based on your team/driver likings.
4. Data displayer for live sessions.
5. Demo (to try out the project on non-session days, uses a fragment of Silverstone 2025 race, sped up x3).


<h1>The app, debriefed!</h1>

<h3>Home menu!</h3>

---

![Home menu, labeled](docs/labeled/home.png)

**(regular) Home menu:**

1. Race weekend GP name, and place.
2. Track hero image.
3. Countdown to next session.
4. Race weekend schedule (times set to your local time!).
5. Options menu; access the demo, setup wizard, and about dialog.

---

![Home menu live, labeled](docs/labeled/homeLive.png)

**(live session ongoing) Home menu:**

1. Live session stopwatch.
2. Join live session button. This allows you to enter the live data displayer for the current live session.

---

<h3>Data displayer (Live Mode)!</h3>

---

![Live mode, labeled](docs/labeled/liveMode.png)

**Live mode:**

1. Main session info (Event, stopwatch, lap count & pit loss (limited to race & sprint), track & air temperature).
2. Options menu (same options as before, plus the exit live button).
3. Session state info (Track clear, yellow flag, VSC, SC, red flag, waiting to start, finished, etc).
4. Race feed allocated space for F1 TV stream (depends on your choice in the setup wizard, more info in Layouts!).*
5. Race control announcements.
6. Team radios.
7. Track circuit map (with turn numbers and marshal sector lights).
8. Position tower (driver, wheel compound type, lap times, gap to leader (for qualis/practice), gap to next car (for race/sprint), plus car status (in pit/out, retired, eliminated)).

---

<h3>Layouts!</h3>

<sub>NOTE: these images come from the DEMO, that's why the circuit map includes driver track position dots, as the historical data used here can be accessed for free from OpenF1. Live mode doesn't have these dots in the circuit map, as to get that working a F1 TV subscription has to be DIRECTLY connected to the app, and for safety reasons I rather not implement this feature.</sub>

---

![Layout (No F1 TV)](docs/labeled/demoLayout_no.png)

<sub>*No F1 TV*</sub>

---

![Layout (F1 TV Pro)](docs/labeled/demoLayout_pro.png)

<sub>*F1 TV Pro*</sub>

---

![Layout (F1 TV Premium)](docs/labeled/demoLayout_prem.png)

<sub>*F1 TV Premium*</sub>

---

**Layouts:**

*The amount of allocated spaces for F1 TV live streams you get in your live mode is determined by your choice in the setup wizard. (No F1 TV → 0, F1 TV Pro → 1 (race feed), F1 TV Premium → 2 (race feed + fav driver onboard))*

1. Circuit map.
2. Race control.
3. Team radio.
4. Position tower.
5. Race feed.
6. Fav driver onboard.

---

<h1>Use your own hero circuit photos!</h1>

P1xp ships with no hero circuit photography. By default, the hero is empty. If you want a photo of the track there (like in the display images in this very interesting README), you are free to pick them by yourself!

![Home](docs/screenshots/home_normal.png)

<sub>*Home menu with COTA circuit hero image.*</sub>

---

**Where's Waldo? Eh, sorry, the image folder?**

| OS | Folder |
|---|---|
| Windows | `AppData\Roaming\p1xp\tracks` |
| macOS | `~/Library/Application Support/P1XP/tracks` |
| Linux | `~/.config/P1XP/tracks` |

For your convinience, you can find this folder in **About → Open image folder**.

---

**How do I add my incredible images?**

1. Find any photo you like! Landscape is forced EH, I MEAN, **recommended**.
2. Name it after the circuit, using the **EXACT** names below. No exceptions!
3. Drop it in the folder.
4. Restart P1xp, and enjoy your images!

`.webp`, `.jpg` and `.png` all work, and roughly 1920x1080 is the best for appearance.

---

**Those stubborn circuit names YOU NEED to use for your images!**

`abu-dhabi`, `australia`, `austria`, `azerbaijan`, `bahrain`, `barcelona`, `belgium`,
`brazil`, `britain`, `canada`, `china`, `emilia-romagna`, `hungary`, `italy`, `japan`,
`las-vegas`, `madrid`, `malaysia`, `mexico`, `miami`, `monaco`, `netherlands`,
`portugal`, `qatar`, `saudi-arabia`, `singapore`, `turkiye`, `united-states`.

<sub>In case any track gets added to the calendar, I would have to update the app so it supports images for that specific track. I tried to cover as many possibilities here as possible (don't judge my word choice).</sub>

---

**How to name your file: the example!**

so wow I have a very cool and amazing WEBP image for spa! imma add it to P1xp! so, lemme name it `belgium.webp`!

oh look, I found another one, a PNG one, for COTA! isn't it so peak? lemme name it `united-states.png`!

---

**But starvulkan, why did you give the user more work and didn't bundle the images yourself?**

cuz copyright is a thing, highly smart human! the best images are mostly always owned by an agency or a team, and there's barely any good free ones to use. and if I bundle the good ones (the ones I have in my P1xp install), I will be sent to the sixth layer of copyright hell for the unforgivable sin of redistribution. so, instead of forcing you a bunch of mid-quality images, I give you the amazing power of choosing your own from whatever source!

---

<h1>About API Usage!</h1>


**P1xp relies on three APIs to work:**

1. OpenF1 (Schedules, calendars, drivers, demo data; all available through a local offline fallback).
2. F1's official servers (through a SignalR Core client to extract live data).
3. MultiViewer (circuit outlines, corner numbers, marshal sector positions, pit loss times).

---

<h1>Image Gallery!</h1>

|  |  |
|:--:|:--:|
| <img src="docs/screenshots/demo_no.png"> | <img src="docs/screenshots/demo_prem.png"> |
| <img src="docs/screenshots/demo_pro.png"> | <img src="docs/screenshots/home_normal.png"> |
| <img src="docs/screenshots/qualiHome_live.png"> | <img src="docs/screenshots/qualiLive_normal.png"> |
| <img src="docs/screenshots/qualiLive_yellow.png"> | <img src="docs/screenshots/raceHome_live.png"> |
| <img src="docs/screenshots/raceHome_waiting.png"> | <img src="docs/screenshots/raceLive_finished.png"> |
| <img src="docs/screenshots/raceLive_normal.png"> | <img src="docs/screenshots/raceLive_vscYellow_Double.png"> |
| <img src="docs/screenshots/raceLive_waiting.png"> | <img src="docs/screenshots/raceLive_yellow.png"> |
| <img src="docs/screenshots/setup_driver.png"> | <img src="docs/screenshots/setup_f1TV.png"> |
| <img src="docs/screenshots/setup_team.png"> | <img src="docs/screenshots/about.png"> |

---

<h1>Made for Stardance!</h1>

this project was created as part of the Hack Club Stardance challenge!

---

<sub>P1xp is an unofficial project and is not associated with Formula 1, the FIA, or any team. F1, FORMULA 1 and related marks are trade marks of Formula One Licensing BV.</sub>






