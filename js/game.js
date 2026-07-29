/*
 * game.js — pure game rules for Battleship.
 *
 * This file knows nothing about the DOM. It only describes boards, ships and
 * what happens when a square is fired at. Everything here is deterministic and
 * easy to read: the display layer (ui.js) and the AI (ai.js) both sit on top of it.
 */

const BOARD_SIZE = 10;

// Row labels A–J, column labels 1–10.
const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

// The standard Battleship fleet. Both sides get one of each.
const SHIP_TYPES = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
];

/** Human-readable name of a square, e.g. {row: 0, col: 0} -> "A1". */
function squareName(row, col) {
  return ROW_LABELS[row] + (col + 1);
}

/** True if the coordinates are on the board. */
function isOnBoard(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

/**
 * Creates an empty board.
 *
 * ships:  the fleet placed on this board so far.
 * shots:  what the *opponent* has fired at this board — null, 'hit' or 'miss'.
 */
function createBoard() {
  return {
    ships: [],
    shots: makeGrid(null),
  };
}

/** Builds a 10x10 array-of-arrays filled with `value`. */
function makeGrid(value) {
  const grid = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    grid.push(new Array(BOARD_SIZE).fill(value));
  }
  return grid;
}

/** Returns the squares a ship would occupy, or null if it would fall off the board. */
function shipCells(size, row, col, orientation) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    const r = orientation === 'vertical' ? row + i : row;
    const c = orientation === 'horizontal' ? col + i : col;
    if (!isOnBoard(r, c)) return null;
    cells.push({ row: r, col: c });
  }
  return cells;
}

/** The ship occupying a square, or null if the square is empty. */
function shipAt(board, row, col) {
  return board.ships.find((ship) =>
    ship.cells.some((cell) => cell.row === row && cell.col === col)
  ) || null;
}

/** A placement is legal when it fits on the board and touches no other ship. */
function canPlaceShip(board, size, row, col, orientation) {
  const cells = shipCells(size, row, col, orientation);
  if (!cells) return false;
  return cells.every((cell) => shipAt(board, cell.row, cell.col) === null);
}

/**
 * Places a ship on the board. Returns true when it was placed, false when the
 * placement was illegal (overlapping or off the board) — the board is unchanged
 * in that case.
 */
function placeShip(board, name, size, row, col, orientation) {
  if (!canPlaceShip(board, size, row, col, orientation)) return false;
  board.ships.push({
    name: name,
    size: size,
    cells: shipCells(size, row, col, orientation),
    hits: 0,
    sunk: false,
  });
  return true;
}

/** Removes every ship from the board (shots are left alone). */
function clearShips(board) {
  board.ships = [];
}

/**
 * Places the whole fleet in random legal positions. Used for the "Randomise"
 * button and for the AI's own fleet.
 */
function placeFleetRandomly(board) {
  clearShips(board);
  SHIP_TYPES.forEach((type) => {
    let placed = false;
    while (!placed) {
      const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
      const row = Math.floor(Math.random() * BOARD_SIZE);
      const col = Math.floor(Math.random() * BOARD_SIZE);
      placed = placeShip(board, type.name, type.size, row, col, orientation);
    }
  });
}

/**
 * Fires at a square on `board`.
 *
 * Returns { result: 'already' | 'miss' | 'hit', ship, sunk }, where `ship` is the
 * ship that was hit (if any) and `sunk` says whether that shot finished it off.
 */
function fireAt(board, row, col) {
  if (!isOnBoard(row, col) || board.shots[row][col] !== null) {
    return { result: 'already', ship: null, sunk: false };
  }

  const ship = shipAt(board, row, col);
  if (!ship) {
    board.shots[row][col] = 'miss';
    return { result: 'miss', ship: null, sunk: false };
  }

  board.shots[row][col] = 'hit';
  ship.hits += 1;
  ship.sunk = ship.hits >= ship.size;
  return { result: 'hit', ship: ship, sunk: ship.sunk };
}

/** True once every ship on the board has been sunk. */
function isFleetSunk(board) {
  return board.ships.length > 0 && board.ships.every((ship) => ship.sunk);
}
