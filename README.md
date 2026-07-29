# battleship-devin

Battleship vs an AI opponent, built and debugged with Devin.

A single-page browser game: you place a fleet on a 10x10 grid and take alternating
shots with an AI opponent until one fleet is gone. Plain HTML, CSS and JavaScript —
no frameworks, no build step, no backend.

**Play it live:** _(deployment link to be added)_

## Running it locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## How to play

1. Place your five ships by clicking your own grid (use **Rotate** to switch between
   horizontal and vertical), or press **Randomise** to place them all at once.
2. Press **Start game**.
3. Click a square on **Enemy waters** to fire. The AI replies with one shot.
4. The first side to lose its whole fleet loses. **New game** resets everything.

Orange squares are hits, faint dots are misses, and a ship that has been sunk turns
blue. The status line at the top always says whose turn it is and what just happened;
the log at the bottom keeps the full history.

## How the AI opponent works

All of the AI's code is in `js/ai.js`. It never looks at your board — the only
information it gets is the result of its own shots, passed to `recordResult()` as
"hit", "miss" and "sunk". It keeps its own private map of squares it has already
fired at, so it never fires at the same square twice.

It plays in two modes:

- **Hunt** — when it has no unfinished hits to chase, it fires at a random untried
  square on a chequerboard pattern (only squares where row + column is even). Since
  the smallest ship is two squares long, every ship must cover at least one of those
  squares, so this finds ships roughly twice as fast as firing completely at random.
- **Target** — as soon as it scores a hit, it queues the squares immediately above,
  below, left and right of that hit and works through them. Once it has two hits in
  a line it stops guessing sideways and only tries the two ends of that line, which
  is where the rest of the ship must be.

When a ship sinks, the AI writes off the unbroken line of hits containing the killing
shot — that was the ship — and goes back to hunting. If any earlier hits are still
unaccounted for (which happens when two ships are sitting side by side) it keeps
chasing those instead of starting over.

Against randomly placed fleets it finishes a game in about 55 shots on average, out
of the 100 squares on the board.

## How the code is organised

| File | What it does |
| --- | --- |
| `index.html` | Page structure: status line, setup controls, the two grids, the log. |
| `styles.css` | Dark theme, grid layout, and the hit / miss / sunk colours. |
| `js/game.js` | The rules only. Boards, ship placement, firing, "is this fleet sunk?". Knows nothing about the page. |
| `js/ai.js` | The AI opponent, kept separate so its logic is easy to review. |
| `js/ui.js` | Everything on screen: drawing the grids, handling clicks, running the turn order. |

The split to keep in mind: **`game.js` decides what is true, `ui.js` decides what is
shown.** The AI talks only to `game.js`-shaped data, never to the DOM.

## Deployment

The site is static, so it can be deployed as-is (for example on Vercel) with no build
command and the repository root as the output directory.
