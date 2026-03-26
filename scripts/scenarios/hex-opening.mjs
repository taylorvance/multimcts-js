import { HexState } from './games/hex.mjs';

export const label = 'hex-opening';
export const defaultGames = 12;
export const defaultIterations = 1500;
export const defaultSamples = 10;
export const defaultWarmup = 2;

export const createInitialState = () => new HexState();
export const createState = createInitialState;
