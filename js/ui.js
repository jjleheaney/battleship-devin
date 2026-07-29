/*
 * ui.js — everything the player sees and clicks.
 *
 * This file owns the DOM: it draws the two grids, handles clicks, runs the turn
 * order and prints the status line. The rules live in game.js and the opponent's
 * brain lives in ai.js; this file just wires them together.
 */

// ---------------------------------------------------------------------------
// Application state
// ---------------------------------------------------------------------------

// 'placing' = the player is still setting up, 'playing' = shots are being fired,
// 'over' = someone has won and all input is disabled.
let phase = 'placing';

let playerBoard = null;
let aiBoard = null;
let ai = null;

// Placement helpers: which ship is being placed next and which way it points.
let nextShipIndex = 0;
let orientation = 'horizontal';

// True while the AI's shot is pending, so the player cannot fire twice.
let awaitingAI = false;

const DOM = {};

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  DOM.playerGrid = document.getElementById('player-grid');
  DOM.enemyGrid = document.getElementById('enemy-grid');
  DOM.status = document.getElementById('status');
  DOM.log = document.getElementById('log');
  DOM.setupPanel = document.getElementById('setup-panel');
  DOM.setupHint = document.getElementById('setup-hint');
  DOM.rotateButton = document.getElementById('rotate-button');
  DOM.randomiseButton = document.getElementById('randomise-button');
  DOM.startButton = document.getElementById('start-button');
  DOM.newGameButton = document.getElementById('new-game-button');
  DOM.playerFleet = document.getElementById('player-fleet');
  DOM.enemyFleet = document.getElementById('enemy-fleet');

  DOM.rotateButton.addEventListener('click', toggleOrientation);
  DOM.randomiseButton.addEventListener('click', randomisePlayerFleet);
  DOM.startButton.addEventListener('click', startGame);
  DOM.newGameButton.addEventListener('click', newGame);

  newGame();
});

/** Resets absolutely everything and returns to the placement phase. */
function newGame() {
  phase = 'placing';
  playerBoard = createBoard();
  aiBoard = createBoard();
  ai = createAI();
  nextShipIndex = 0;
  orientation = 'horizontal';
  awaitingAI = false;

  placeFleetRandomly(aiBoard);

  DOM.log.textContent = '';
  DOM.setupPanel.hidden = false;
  render();
  setStatus('Place your fleet to begin.');
}

// ---------------------------------------------------------------------------
// Placement phase
// ---------------------------------------------------------------------------

/** The ship the player still has to place, or null when the fleet is complete. */
function nextShip() {
  return nextShipIndex < SHIP_TYPES.length ? SHIP_TYPES[nextShipIndex] : null;
}

function toggleOrientation() {
  orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
  render();
}

function randomisePlayerFleet() {
  if (phase !== 'placing') return;
  placeFleetRandomly(playerBoard);
  nextShipIndex = SHIP_TYPES.length;
  render();
  setStatus('Fleet placed. Press "Start game" when you are ready.');
}

/** Handles a click on the player's own grid while ships are being placed. */
function handlePlacementClick(row, col) {
  const ship = nextShip();
  if (phase !== 'placing' || !ship) return;

  if (!placeShip(playerBoard, ship.name, ship.size, row, col, orientation)) {
    setStatus('That ship will not fit there. Try another square.');
    return;
  }

  nextShipIndex += 1;
  render();
  const remaining = nextShip();
  setStatus(
    remaining
      ? 'Placed your ' + ship.name + '. Now place your ' + remaining.name + '.'
      : 'Fleet placed. Press "Start game" when you are ready.'
  );
}

function startGame() {
  if (phase !== 'placing' || nextShip() !== null) return;
  phase = 'playing';
  DOM.setupPanel.hidden = true;
  render();
  setStatus('Your turn — fire at the enemy grid.');
}

// ---------------------------------------------------------------------------
// Playing phase
// ---------------------------------------------------------------------------

/** Handles a click on the enemy grid: the player's shot. */
function handlePlayerShot(row, col) {
  if (phase !== 'playing' || awaitingAI) return;

  const shot = fireAt(aiBoard, row, col);
  if (shot.result === 'already') {
    setStatus('You have already fired at ' + squareName(row, col) + '.');
    return;
  }

  if (shot.result === 'miss') {
    addLog('You fired at ' + squareName(row, col) + ' — miss.');
  } else if (shot.sunk) {
    addLog('You fired at ' + squareName(row, col) + ' — hit! You sank the AI\'s ' + shot.ship.name + '.');
  } else {
    addLog('You fired at ' + squareName(row, col) + ' — hit!');
  }

  render();

  if (isFleetSunk(aiBoard)) {
    endGame('player');
    return;
  }

  // Give the player a moment to see their result before the AI replies.
  awaitingAI = true;
  setStatus('AI is taking aim…');
  window.setTimeout(takeAITurn, 700);
}

/** Runs the AI's single shot, then hands the turn back to the player. */
function takeAITurn() {
  if (phase !== 'playing') return; // A new game may have been started during the pause.
  const target = chooseShot(ai);
  if (target === null) return; // Board exhausted; cannot happen in a normal game.

  const shot = fireAt(playerBoard, target.row, target.col);
  recordResult(ai, target.row, target.col, shot.result, shot.sunk);

  if (shot.result === 'miss') {
    addLog('AI fired at ' + squareName(target.row, target.col) + ' — miss.');
  } else if (shot.sunk) {
    addLog('AI fired at ' + squareName(target.row, target.col) + ' — hit! The AI sank your ' + shot.ship.name + '.');
  } else {
    addLog('AI fired at ' + squareName(target.row, target.col) + ' — hit!');
  }

  awaitingAI = false;
  render();

  if (isFleetSunk(playerBoard)) {
    endGame('ai');
    return;
  }

  setStatus('Your turn — fire at the enemy grid.');
}

/** Declares a winner and locks the board. */
function endGame(winner) {
  phase = 'over';
  awaitingAI = false;
  render();
  if (winner === 'player') {
    setStatus('You win! The AI\'s fleet is destroyed. Press "New game" to play again.');
    addLog('Game over — you win.');
  } else {
    setStatus('The AI wins — your fleet is destroyed. Press "New game" to play again.');
    addLog('Game over — the AI wins.');
  }
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

function setStatus(text) {
  DOM.status.textContent = text;
}

/** Adds a line to the running commentary, newest first. */
function addLog(text) {
  const line = document.createElement('p');
  line.className = 'log-line';
  line.textContent = text;
  DOM.log.prepend(line);
}

/** Redraws both grids, both fleet lists and the setup controls. */
function render() {
  drawGrid(DOM.playerGrid, playerBoard, 'player');
  drawGrid(DOM.enemyGrid, aiBoard, 'enemy');
  drawFleet(DOM.playerFleet, playerBoard, true);
  drawFleet(DOM.enemyFleet, aiBoard, false);
  renderSetupControls();
}

function renderSetupControls() {
  const ship = nextShip();
  DOM.startButton.disabled = ship !== null;
  DOM.rotateButton.textContent =
    'Rotate (' + (orientation === 'horizontal' ? 'horizontal' : 'vertical') + ')';
  DOM.setupHint.textContent = ship
    ? 'Click your grid to place your ' + ship.name + ' (' + ship.size + ' squares).'
    : 'All ships placed.';
}

/**
 * Draws one 10x10 grid with its row/column labels.
 *
 * `side` is 'player' (own ships visible, enemy shots shown) or 'enemy' (ships
 * hidden until sunk, clicking fires a shot).
 */
function drawGrid(container, board, side) {
  container.innerHTML = '';

  // Top-left corner spacer, then the column numbers.
  container.appendChild(makeLabel(''));
  for (let col = 0; col < BOARD_SIZE; col++) {
    container.appendChild(makeLabel(String(col + 1)));
  }

  for (let row = 0; row < BOARD_SIZE; row++) {
    container.appendChild(makeLabel(ROW_LABELS[row]));
    for (let col = 0; col < BOARD_SIZE; col++) {
      container.appendChild(makeCell(board, side, row, col));
    }
  }
}

function makeLabel(text) {
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = text;
  return label;
}

/** Builds a single clickable square. */
function makeCell(board, side, row, col) {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = 'cell';
  cell.dataset.square = squareName(row, col);
  cell.setAttribute('aria-label', squareName(row, col));

  const shot = board.shots[row][col];
  const ship = shipAt(board, row, col);

  // A ship is drawn on your own grid always, and on the enemy grid once sunk.
  if (ship && (side === 'player' || ship.sunk)) {
    cell.classList.add(ship.sunk ? 'sunk' : 'ship');
  }
  if (shot === 'hit') cell.classList.add('hit');
  if (shot === 'miss') cell.classList.add('miss');

  if (side === 'enemy') {
    const canFire = phase === 'playing' && !awaitingAI && shot === null;
    cell.disabled = !canFire;
    if (canFire) cell.addEventListener('click', () => handlePlayerShot(row, col));
  } else {
    const canPlace = phase === 'placing' && nextShip() !== null;
    cell.disabled = !canPlace;
    if (canPlace) {
      cell.addEventListener('click', () => handlePlacementClick(row, col));
      cell.addEventListener('mouseenter', () => showPlacementPreview(row, col));
      cell.addEventListener('mouseleave', clearPlacementPreview);
    }
  }

  return cell;
}

/** Highlights where the current ship would land when hovering over the grid. */
function showPlacementPreview(row, col) {
  const ship = nextShip();
  if (!ship) return;

  const cells = shipCells(ship.size, row, col, orientation);
  const legal = canPlaceShip(playerBoard, ship.size, row, col, orientation);
  if (!cells) return;

  cells.forEach((cell) => {
    const element = findCellElement(DOM.playerGrid, cell.row, cell.col);
    if (element) element.classList.add(legal ? 'preview' : 'preview-bad');
  });
}

function clearPlacementPreview() {
  DOM.playerGrid.querySelectorAll('.preview, .preview-bad').forEach((element) => {
    element.classList.remove('preview', 'preview-bad');
  });
}

function findCellElement(container, row, col) {
  return container.querySelector('[data-square="' + squareName(row, col) + '"]');
}

/** Draws the "which ships are left" list under a grid. */
function drawFleet(container, board, isPlayer) {
  container.innerHTML = '';
  SHIP_TYPES.forEach((type) => {
    const ship = board.ships.find((s) => s.name === type.name);
    const item = document.createElement('li');
    item.className = 'fleet-item';
    if (ship && ship.sunk) item.classList.add('fleet-item-sunk');
    const suffix = ship && ship.sunk ? ' — sunk' : '';
    const notPlaced = !ship && isPlayer ? ' — not placed' : '';
    item.textContent = type.name + ' (' + type.size + ')' + suffix + notPlaced;
    container.appendChild(item);
  });
}
