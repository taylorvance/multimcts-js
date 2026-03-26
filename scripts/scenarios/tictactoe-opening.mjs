import { TicTacToeState } from '../../dist/examples/tictactoe.js';

export const label = 'tictactoe-opening';
export const defaultGames = 20;
export const defaultIterations = 1000;

export const createInitialState = () => new TicTacToeState();
