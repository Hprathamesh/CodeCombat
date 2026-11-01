# Hero Script 3.0 — The Lost Kingdom

A browser-based programming adventure game with a main menu, player profile, settings, and a custom function workshop.

## Run it
1. Extract `HeroScript3.zip`.
2. Open the `HeroScript3` folder in VS Code.
3. Open `index.html` in a browser, or use VS Code Live Server.
4. Choose **Play Adventure** to enter the six-level game.

## New in 3.0
- Main menu with Play Adventure, Function Workshop, Player Profile and Settings.
- Player profile with rank, XP, coins, stars and chapter records.
- Settings for playback speed, Midnight/Forest theme, reduced motion and progress reset.
- Custom Function Workshop with C++ and Python authoring modes.
- Save, edit and delete reusable helper functions in browser storage.
- Insert a custom helper into the current mission before `main()`.
- Python helper functions are translated into the game's supported C++ subset before insertion.

## Python workshop support
The Python mode is a lightweight translator for educational helper functions, not a full Python interpreter. It supports:
- `def function_name(parameters):`
- `hero` command calls
- `return`
- `if`, `elif`, `else`, `while`
- `for name in range(count)`
- simple variable assignments and boolean literals

C++ and Python custom helpers are validated against the game's supported C++ subset. Complex Python features, imports, classes, libraries and arbitrary Python programs are not supported.

## Project files
- `index.html` — page and menu structure
- `style.css` — game styling and responsive layouts
- `levels.js` — six mission maps, objectives and starter code
- `cpp.js` — supported C++-to-JavaScript translator
- `engine.js` — movement, combat, pathfinding and simulation
- `main.js` — menus, settings, profile, function workshop, rendering and playback

## Notes
- This is a learning prototype with a deliberately limited C++ subset, not a full native C++ compiler.
- Game progress, settings, code and custom functions are stored in browser local storage on the device where you play.
- Use only code you understand and trust; the browser prototype executes submitted code locally.


## Sound effects
Sound effects are synthesized in the browser using the Web Audio API. Use Settings → Sound effects to enable/disable them and Test sound to check your speakers/browser. Click Play or Run once to unlock browser audio. Movement, combat, damage, gem/potion pickup, victory and defeat have sounds. No external audio files are required.
