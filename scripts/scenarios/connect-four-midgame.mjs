import { playConnectFourMoves } from './games/connect-four.mjs';

const MIDGAME_MOVES = [3, 2, 3, 2, 4, 1, 4, 1, 5];

export const label = 'connect-four-midgame';
export const defaultGames = 12;
export const defaultIterations = 3000;
export const defaultSamples = 10;
export const defaultWarmup = 2;

export const createInitialState = () => playConnectFourMoves(MIDGAME_MOVES);
export const createState = createInitialState;
