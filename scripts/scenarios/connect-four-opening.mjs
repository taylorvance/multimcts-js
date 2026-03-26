import { ConnectFourState } from './games/connect-four.mjs';

export const label = 'connect-four-opening';
export const defaultGames = 12;
export const defaultIterations = 2000;
export const defaultSamples = 10;
export const defaultWarmup = 2;

export const createInitialState = () => new ConnectFourState();
export const createState = createInitialState;
