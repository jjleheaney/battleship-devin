/*
 * simulate.js — plays the AI against randomly placed fleets thousands of times
 * and reports how well it behaves. Run it with Node:
 *
 *   node sim/simulate.js            # 20000 games
 *   node sim/simulate.js 5000 42    # 5000 games, seed 42
 *
 * The point of this script is that the numbers quoted about the AI can be
 * re-checked by anyone, on any revision: it only calls the public functions of
 * js/game.js and js/ai.js, so the same script runs against older code as well.
 *
 * The two defects it watches for:
 *
 *  - "misattributed sink": after a ship sinks, the AI is still holding hits that
 *    belong to a ship that is *not* sunk, but has dropped them from its
 *    unresolvedHits list. Those squares are already in `tried`, so the wounded
 *    ship can only be rediscovered by hunting.
 *
 *  - "stranded hits": the AI fires a hunting shot (nowhere near anything it has
 *    hit) while it still holds unresolved hits that *do* have untried squares
 *    next to them. In other words it gave up on a wounded ship it could still
 *    have chased.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// js/game.js and js/ai.js are plain browser scripts, so load them by evaluating
// them together in this scope — exactly the order index.html uses.
eval(
  fs.readFileSync(path.join(ROOT, 'js', 'game.js'), 'utf8') +
    fs.readFileSync(path.join(ROOT, 'js', 'ai.js'), 'utf8')
);

// ---------------------------------------------------------------------------
// Deterministic randomness, so a reported number can be reproduced exactly.
// ---------------------------------------------------------------------------

function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

/** Hits the AI is holding that belong to a ship which has not sunk. */
function liveUnresolvedHits(board, ai) {
  const live = [];
  board.ships
    .filter((ship) => !ship.sunk)
    .forEach((ship) =>
      ship.cells.forEach((cell) => {
        if (ai.hits[cell.row][cell.col]) live.push(cell);
      })
    );
  return live;
}

function isTrackedByAI(ai, cell) {
  return ai.unresolvedHits.some((hit) => hit.row === cell.row && hit.col === cell.col);
}

/** True if any untried square sits next to one of the AI's unresolved hits. */
function hasChaseableNeighbour(ai) {
  return ai.unresolvedHits.some((hit) =>
    [
      { row: hit.row - 1, col: hit.col },
      { row: hit.row + 1, col: hit.col },
      { row: hit.row, col: hit.col - 1 },
      { row: hit.row, col: hit.col + 1 },
    ].some((n) => isOnBoard(n.row, n.col) && !ai.tried[n.row][n.col])
  );
}

/** True if a square touches one of the AI's unresolved hits. */
function touchesUnresolvedHit(ai, row, col) {
  return ai.unresolvedHits.some(
    (hit) => Math.abs(hit.row - row) + Math.abs(hit.col - col) === 1
  );
}

// ---------------------------------------------------------------------------
// One game
// ---------------------------------------------------------------------------

function playGame() {
  const board = createBoard();
  placeFleetRandomly(board);
  const ai = createAI();

  const fired = {};
  let shots = 0;
  let misattributions = 0;
  let strandings = 0;
  let wasStranded = false;

  while (!isFleetSunk(board)) {
    const chaseable = hasChaseableNeighbour(ai);
    const target = chooseShot(ai);
    if (target === null) throw new Error('AI ran out of squares before the fleet sank');

    const key = target.row + ',' + target.col;
    if (fired[key]) throw new Error('AI fired twice at ' + squareName(target.row, target.col));
    fired[key] = true;

    // The AI abandoned a wounded ship it could still have chased.
    const stranded = chaseable && !touchesUnresolvedHit(ai, target.row, target.col);
    if (stranded && !wasStranded) strandings += 1;
    wasStranded = stranded;

    const shot = fireAt(board, target.row, target.col);
    if (shot.result === 'already') throw new Error('AI repeated a shot');

    // `size` is ignored by revisions whose recordResult takes five arguments.
    recordResult(
      ai,
      target.row,
      target.col,
      shot.result,
      shot.sunk,
      shot.ship ? shot.ship.size : null
    );
    shots += 1;

    if (shot.sunk) {
      const dropped = liveUnresolvedHits(board, ai).filter((cell) => !isTrackedByAI(ai, cell));
      if (dropped.length > 0) misattributions += 1;
    }
  }

  return { shots: shots, misattributions: misattributions, strandings: strandings };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function main() {
  const games = Number(process.argv[2] || 20000);
  const seed = Number(process.argv[3] || 1);
  Math.random = makeRandom(seed);

  let shots = 0;
  let worstGame = 0;
  let misattributionEvents = 0;
  let misattributionGames = 0;
  let strandingEvents = 0;
  let strandingGames = 0;
  let cleanShots = 0;
  let cleanGames = 0;

  for (let i = 0; i < games; i++) {
    const result = playGame();
    shots += result.shots;
    worstGame = Math.max(worstGame, result.shots);
    misattributionEvents += result.misattributions;
    strandingEvents += result.strandings;
    if (result.misattributions > 0) misattributionGames += 1;
    if (result.strandings > 0) strandingGames += 1;
    if (result.misattributions === 0 && result.strandings === 0) {
      cleanShots += result.shots;
      cleanGames += 1;
    }
  }

  const percent = (n) => ((100 * n) / games).toFixed(2) + '%';
  const perGame = (n) => (n / games).toFixed(3);

  console.log('games:                      ' + games + ' (seed ' + seed + ')');
  console.log('average shots per game:     ' + (shots / games).toFixed(2));
  console.log('worst game:                 ' + worstGame + ' shots');
  console.log('games with a misattributed sink: ' + percent(misattributionGames) +
    ' (' + perGame(misattributionEvents) + ' events per game)');
  console.log('games with stranded hits:   ' + percent(strandingGames) +
    ' (' + perGame(strandingEvents) + ' episodes per game)');
  console.log('average shots, clean games: ' +
    (cleanGames > 0 ? (cleanShots / cleanGames).toFixed(2) : 'n/a') +
    ' (' + percent(cleanGames) + ' of games)');
}

main();
