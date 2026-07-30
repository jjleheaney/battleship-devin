/*
 * ai.js — the AI opponent.
 *
 * IMPORTANT (and easy to verify): nothing in this file ever looks at the human
 * player's board. The only inputs are (a) the size of the board and (b) the
 * results of the AI's own previous shots, which are handed to `recordResult`.
 * Those results are exactly what a human opponent would be told: hit or miss,
 * whether a ship was sunk, and how long that ship was (the game announces which
 * ship sank, so its length is public information either way). The AI keeps its
 * own private memory of where it has fired and what happened.
 *
 * Strategy — "hunt and target":
 *   1. HUNT   — no unfinished hits known. Fire at a random untried square on a
 *               chequerboard pattern (every other square). Because the smallest
 *               ship is 2 long, it must cover at least one such square, so this
 *               finds ships in about half the shots of pure random firing.
 *   2. TARGET — after a hit, queue the squares next to it and work through them.
 *               Once two hits line up, the AI stops guessing sideways and only
 *               tries the two ends of that line.
 *   3. Back to HUNT once every hit has been accounted for by a sunk ship.
 */

/** Creates a fresh AI brain with an empty memory. */
function createAI() {
  return {
    // Squares the AI has already fired at: tried[row][col] is true or false.
    tried: makeGrid(false),
    // Squares that turned out to be hits.
    hits: makeGrid(false),
    // Hits that do not yet belong to a ship the AI has seen sink.
    unresolvedHits: [],
    // Squares queued up for the TARGET phase, most promising last.
    targetQueue: [],
  };
}

/** Every square the AI has not yet fired at. */
function untriedSquares(ai) {
  const squares = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (!ai.tried[row][col]) squares.push({ row: row, col: col });
    }
  }
  return squares;
}

/**
 * Picks the AI's next shot. Never returns a square it has already fired at.
 * Returns null only if the whole board has been fired at.
 */
function chooseShot(ai) {
  // TARGET phase: work through the queue, skipping anything already tried.
  while (ai.targetQueue.length > 0) {
    const square = ai.targetQueue.pop();
    if (!ai.tried[square.row][square.col]) return square;
  }

  // The queue ran dry but hits are still unaccounted for, which happens when the
  // AI guessed a line that was really two ships and both ends of it missed. The
  // planner only runs on a hit, so re-run it here before giving up on them. It
  // queues untried squares only, so this cannot spin: either a square comes back
  // or the queue stays empty and we drop through to hunting.
  if (ai.unresolvedHits.length > 0) {
    rebuildTargetQueue(ai);
    while (ai.targetQueue.length > 0) {
      const square = ai.targetQueue.pop();
      if (!ai.tried[square.row][square.col]) return square;
    }
  }

  // HUNT phase: prefer the chequerboard squares, fall back to anything left.
  const untried = untriedSquares(ai);
  if (untried.length === 0) return null;
  const chequerboard = untried.filter((s) => (s.row + s.col) % 2 === 0);
  const pool = chequerboard.length > 0 ? chequerboard : untried;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Tells the AI what happened to its shot. `result` is 'hit' or 'miss', `sunk`
 * says whether that hit finished a ship off, and `size` is how long that ship
 * was — the same thing the status line announces to the human player. All five
 * are plain values: no board, fleet or ship object is ever handed over.
 */
function recordResult(ai, row, col, result, sunk, size) {
  ai.tried[row][col] = true;
  if (result !== 'hit') return;

  ai.hits[row][col] = true;
  ai.unresolvedHits.push({ row: row, col: col });

  // A ship went down: the squares it occupied are settled. Any other hits still
  // need chasing — they belong to a second ship alongside the one just sunk.
  if (sunk) forgetSunkShip(ai, row, col, size);

  rebuildTargetQueue(ai);
}

/**
 * Drops the sunk ship's squares from the unresolved list.
 *
 * The killing shot sits somewhere in a line of hits, but that line can be longer
 * than the ship if a wounded neighbour is hit alongside it. Knowing how long the
 * ship was, the AI takes exactly that many squares, closest to the killing shot,
 * along whichever axis can actually hold it — so a wounded neighbour's hits stay
 * on the list and keep being chased.
 */
function forgetSunkShip(ai, row, col, size) {
  const horizontal = hitRun(ai, row, col, 0, 1);
  const vertical = hitRun(ai, row, col, 1, 0);

  // Prefer the axis long enough to hold the ship; if both or neither can, fall
  // back to the longer run.
  const horizontalFits = horizontal.length >= size;
  const verticalFits = vertical.length >= size;
  let line;
  if (horizontalFits && !verticalFits) {
    line = horizontal;
  } else if (verticalFits && !horizontalFits) {
    line = vertical;
  } else {
    line = horizontal.length >= vertical.length ? horizontal : vertical;
  }

  const ship = nearestCells(line, row, col, size);
  ai.unresolvedHits = ai.unresolvedHits.filter(
    (hit) => !ship.some((cell) => cell.row === hit.row && cell.col === hit.col)
  );
}

/** The `count` cells of `line` closest to the given square. */
function nearestCells(line, row, col, count) {
  const distance = (cell) => Math.abs(cell.row - row) + Math.abs(cell.col - col);
  return line.slice().sort((a, b) => distance(a) - distance(b)).slice(0, count);
}

/**
 * Follows a straight, unbroken line of hits through a square, in both
 * directions. `rowStep`/`colStep` give the direction: (0,1) is horizontal.
 */
function hitRun(ai, row, col, rowStep, colStep) {
  const run = [{ row: row, col: col }];

  for (const sign of [-1, 1]) {
    let r = row + sign * rowStep;
    let c = col + sign * colStep;
    while (isOnBoard(r, c) && ai.hits[r][c]) {
      run.push({ row: r, col: c });
      r += sign * rowStep;
      c += sign * colStep;
    }
  }

  return run;
}

/**
 * Works out which squares are worth trying next, based only on the AI's own
 * unresolved hits.
 */
function rebuildTargetQueue(ai) {
  ai.targetQueue = [];
  if (ai.unresolvedHits.length === 0) return;

  // Chase the most recent unresolved hit and whatever lines up with it.
  const anchor = ai.unresolvedHits[ai.unresolvedHits.length - 1];
  const horizontal = unresolvedRun(ai, anchor, 0, 1);
  const vertical = unresolvedRun(ai, anchor, 1, 0);

  if (horizontal.length > 1) {
    const cols = horizontal.map((hit) => hit.col);
    queueIfUseful(ai, anchor.row, Math.min.apply(null, cols) - 1);
    queueIfUseful(ai, anchor.row, Math.max.apply(null, cols) + 1);
  } else if (vertical.length > 1) {
    const rows = vertical.map((hit) => hit.row);
    queueIfUseful(ai, Math.min.apply(null, rows) - 1, anchor.col);
    queueIfUseful(ai, Math.max.apply(null, rows) + 1, anchor.col);
  } else {
    // A lone hit: try all four neighbours.
    queueIfUseful(ai, anchor.row - 1, anchor.col);
    queueIfUseful(ai, anchor.row + 1, anchor.col);
    queueIfUseful(ai, anchor.row, anchor.col - 1);
    queueIfUseful(ai, anchor.row, anchor.col + 1);
  }

  // If that line is boxed in, fall back to any other hit still unaccounted for.
  if (ai.targetQueue.length === 0) queueNeighboursOfAnyUnresolvedHit(ai);
}

/** Follows a line of *unresolved* hits through `anchor` in one direction. */
function unresolvedRun(ai, anchor, rowStep, colStep) {
  const isUnresolved = (r, c) =>
    ai.unresolvedHits.some((hit) => hit.row === r && hit.col === c);

  const run = [anchor];
  for (const sign of [-1, 1]) {
    let r = anchor.row + sign * rowStep;
    let c = anchor.col + sign * colStep;
    while (isOnBoard(r, c) && isUnresolved(r, c)) {
      run.push({ row: r, col: c });
      r += sign * rowStep;
      c += sign * colStep;
    }
  }
  return run;
}

/** Last resort while targeting: any untried square next to any unresolved hit. */
function queueNeighboursOfAnyUnresolvedHit(ai) {
  ai.unresolvedHits.forEach((hit) => {
    queueIfUseful(ai, hit.row - 1, hit.col);
    queueIfUseful(ai, hit.row + 1, hit.col);
    queueIfUseful(ai, hit.row, hit.col - 1);
    queueIfUseful(ai, hit.row, hit.col + 1);
  });
}

/** Adds a square to the target queue if it is on the board and untried. */
function queueIfUseful(ai, row, col) {
  if (!isOnBoard(row, col)) return;
  if (ai.tried[row][col]) return;
  ai.targetQueue.push({ row: row, col: col });
}
