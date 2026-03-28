import { playIsolationMoves } from './games/isolation.mjs';

const SIZE = 7;
const index = (row, col) => (row * SIZE) + col;
const MIDGAME_MOVES = [
  index(2, 3),
  index(4, 1),
  index(4, 5),
  index(3, 4),
  index(3, 1),
  index(3, 5),
  index(4, 4),
  index(2, 2),
  index(2, 4),
];

export const label = 'isolation-midgame';
export const defaultIterations = 2500;
export const defaultSamples = 10;
export const defaultWarmup = 2;

export const createInitialState = () => playIsolationMoves(MIDGAME_MOVES, SIZE);
export const createState = createInitialState;
