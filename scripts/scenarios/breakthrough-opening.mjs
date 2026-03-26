import { BreakthroughState } from './games/breakthrough.mjs';

export const label = 'breakthrough-opening';
export const defaultGames = 10;
export const defaultIterations = 1500;
export const defaultSamples = 10;
export const defaultWarmup = 2;

export const createInitialState = () => new BreakthroughState();
export const createState = createInitialState;
