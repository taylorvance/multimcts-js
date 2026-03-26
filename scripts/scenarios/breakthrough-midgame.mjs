import { playBreakthroughMoves } from './games/breakthrough.mjs';

const MIDGAME_MOVES = [
  '48:40',
  '8:16',
  '49:41',
  '9:17',
  '40:33',
  '17:25',
  '50:42',
  '10:18',
  '42:35',
  '18:26',
  '51:43',
  '11:19',
];

export const label = 'breakthrough-midgame';
export const defaultGames = 10;
export const defaultIterations = 2200;
export const defaultSamples = 10;
export const defaultWarmup = 2;

export const createInitialState = () => playBreakthroughMoves(MIDGAME_MOVES);
export const createState = createInitialState;
