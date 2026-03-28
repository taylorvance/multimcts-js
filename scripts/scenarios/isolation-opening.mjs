import { IsolationState } from './games/isolation.mjs';

export const label = 'isolation-opening';
export const defaultIterations = 2000;
export const defaultSamples = 10;
export const defaultWarmup = 2;

export const createInitialState = () => new IsolationState();
export const createState = createInitialState;
