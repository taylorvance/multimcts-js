import { playHexMoves } from './games/hex.mjs';

const SIZE = 7;
const index = (row, col) => (row * SIZE) + col;
const MIDGAME_MOVES = [
  index(0, 3),
  index(3, 0),
  index(1, 3),
  index(3, 1),
  index(2, 2),
  index(2, 4),
  index(3, 2),
  index(4, 1),
  index(4, 3),
  index(3, 4),
  index(5, 2),
  index(4, 4),
];

export const label = 'hex-midgame';
export const defaultGames = 12;
export const defaultIterations = 2500;
export const defaultSamples = 10;
export const defaultWarmup = 2;

export const createInitialState = () => playHexMoves(MIDGAME_MOVES, SIZE);
export const createState = createInitialState;
