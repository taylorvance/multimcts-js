import { TicTacToeState } from '../../dist/examples/tictactoe.js';

export const label = 'tictactoe-midgame';
export const defaultIterations = 5000;
export const defaultSamples = 12;
export const defaultWarmup = 2;

export const createState = () => new TicTacToeState([
  'X', 'X', null,
  null, 'O', null,
  null, null, 'O',
], 'X');
