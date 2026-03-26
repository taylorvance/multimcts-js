import { OthelloState } from './games/othello.mjs';

export const label = 'othello-opening';
export const defaultGames = 8;
export const defaultIterations = 1500;
export const defaultSamples = 8;
export const defaultWarmup = 1;

export const createInitialState = () => new OthelloState();
export const createState = createInitialState;
