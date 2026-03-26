import { GameState } from '../index.ts';

export type OthelloCell = 'B' | 'W' | null;
export type OthelloTeam = 'B' | 'W';
export type OthelloMove = string;

const ROWS = 8;
const COLS = 8;
const TOTAL_CELLS = ROWS * COLS;
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

export class OthelloState extends GameState<OthelloMove, OthelloTeam, OthelloState> {
  readonly board: readonly OthelloCell[];
  readonly team: boolean;
  readonly lastMove: number | null;

  constructor(
    board: readonly OthelloCell[] = OthelloState.initializeBoard(),
    team = true,
    lastMove: number | null = null,
  ) {
    super();
    this.board = [...board];
    this.team = team;
    this.lastMove = lastMove;
  }

  static initializeBoard() {
    const board = Array<OthelloCell>(TOTAL_CELLS).fill(null);
    board[(3 * COLS) + 3] = 'W';
    board[(3 * COLS) + 4] = 'B';
    board[(4 * COLS) + 3] = 'B';
    board[(4 * COLS) + 4] = 'W';
    return board;
  }

  getCurrentTeam() {
    return this.team ? 'B' : 'W';
  }

  getLegalMoves() {
    if(this.isBoardFull()) {
      return [];
    }

    const moves: string[] = [];

    for(let index = 0; index < TOTAL_CELLS; index += 1) {
      if(this.isLegalMove(index, this.team)) {
        moves.push(String(index));
      }
    }

    if(moves.length > 0) {
      return moves;
    }

    return this.hasAnyLegalMoveForTeam(!this.team) ? ['pass'] : [];
  }

  override suggestRollout(random: () => number) {
    if(this.isBoardFull()) {
      throw new Error('Cannot suggest a rollout move from a terminal Othello state.');
    }

    let legalCount = 0;
    let chosenIndex: number | null = null;

    for(let index = 0; index < TOTAL_CELLS; index += 1) {
      if(!this.isLegalMove(index, this.team)) {
        continue;
      }

      legalCount += 1;
      if(Math.floor(random() * legalCount) === 0) {
        chosenIndex = index;
      }
    }

    if(legalCount === 0) {
      if(!this.hasAnyLegalMoveForTeam(!this.team)) {
        throw new Error('Cannot suggest a rollout move from a terminal Othello state.');
      }

      return {
        move: 'pass',
        nextState: new OthelloState(this.board, !this.team, null),
      };
    }

    if(chosenIndex === null) {
      throw new Error('Failed to sample a legal Othello move.');
    }

    const nextBoard = [...this.board];
    nextBoard[chosenIndex] = this.team ? 'B' : 'W';
    const chosenFlips = this.getFlips(chosenIndex, this.team);

    for(const flipIndex of chosenFlips) {
      nextBoard[flipIndex] = this.team ? 'B' : 'W';
    }

    return {
      move: String(chosenIndex),
      nextState: new OthelloState(nextBoard, !this.team, chosenIndex),
    };
  }

  override sampleLegalMove(random: () => number) {
    if(this.isBoardFull()) {
      throw new Error('Cannot sample a legal move from a terminal Othello state.');
    }

    let legalCount = 0;
    let chosenIndex: number | null = null;

    for(let index = 0; index < TOTAL_CELLS; index += 1) {
      if(!this.isLegalMove(index, this.team)) {
        continue;
      }

      legalCount += 1;
      if(Math.floor(random() * legalCount) === 0) {
        chosenIndex = index;
      }
    }

    if(legalCount === 0) {
      if(!this.hasAnyLegalMoveForTeam(!this.team)) {
        throw new Error('Cannot sample a legal move from a terminal Othello state.');
      }

      return 'pass';
    }

    return String(chosenIndex);
  }

  makeMove(move: string) {
    if(move === 'pass') {
      if(this.isTerminal()) {
        throw new Error('Illegal Othello pass.');
      }

      const legalMoves = this.getLegalMoves();
      if(legalMoves.length > 0 && legalMoves[0] !== 'pass') {
        throw new Error('Illegal Othello pass.');
      }

      return new OthelloState(this.board, !this.team, null);
    }

    const index = Number.parseInt(move, 10);
    if(!Number.isInteger(index)) {
      throw new Error(`Invalid Othello move: ${move}`);
    }

    const flips = this.getFlips(index, this.team);
    if(flips.length === 0) {
      throw new Error(`Illegal Othello move: ${move}`);
    }

    const nextBoard = [...this.board];
    nextBoard[index] = this.team ? 'B' : 'W';

    for(const flipIndex of flips) {
      nextBoard[flipIndex] = this.team ? 'B' : 'W';
    }

    return new OthelloState(nextBoard, !this.team, index);
  }

  isTerminal() {
    if(this.isBoardFull()) {
      return true;
    }

    return !this.hasAnyLegalMoveForTeam(true)
      && !this.hasAnyLegalMoveForTeam(false);
  }

  getReward() {
    const { black, white } = this.getScore();

    if(black === white) {
      return { B: 0.5, W: 0.5 };
    }

    return black > white
      ? { B: 1, W: 0 }
      : { B: 0, W: 1 };
  }

  override toString() {
    const rows: string[] = [];

    for(let row = 0; row < ROWS; row += 1) {
      let rowString = '';

      for(let col = 0; col < COLS; col += 1) {
        rowString += this.board[this.getIndex(row, col)] ?? '.';
      }

      rows.push(rowString);
    }

    return `${this.getCurrentTeam()}: ${rows.join('/')}`;
  }

  private getScore() {
    let black = 0;
    let white = 0;

    for(const cell of this.board) {
      if(cell === 'B') {
        black += 1;
      } else if(cell === 'W') {
        white += 1;
      }
    }

    return { black, white };
  }

  private hasAnyLegalMoveForTeam(team: boolean) {
    for(let index = 0; index < TOTAL_CELLS; index += 1) {
      if(this.isLegalMove(index, team)) {
        return true;
      }
    }

    return false;
  }

  private isLegalMove(index: number, team: boolean) {
    if(index < 0 || index >= TOTAL_CELLS || this.board[index] !== null) {
      return false;
    }

    const row = Math.floor(index / COLS);
    const col = index % COLS;
    const teamCell = team ? 'B' : 'W';
    const opponentCell = team ? 'W' : 'B';

    for(const [rowDelta, colDelta] of DIRECTIONS) {
      let nextRow = row + rowDelta;
      let nextCol = col + colDelta;
      let seenOpponent = false;

      while(nextRow >= 0 && nextRow < ROWS && nextCol >= 0 && nextCol < COLS) {
        const nextIndex = this.getIndex(nextRow, nextCol);
        const cell = this.board[nextIndex];

        if(cell === opponentCell) {
          seenOpponent = true;
          nextRow += rowDelta;
          nextCol += colDelta;
          continue;
        }

        if(cell === teamCell && seenOpponent) {
          return true;
        }

        break;
      }
    }

    return false;
  }

  private getFlips(index: number, team: boolean) {
    if(index < 0 || index >= TOTAL_CELLS || this.board[index] !== null) {
      return [];
    }

    const row = Math.floor(index / COLS);
    const col = index % COLS;
    const teamCell = team ? 'B' : 'W';
    const opponentCell = team ? 'W' : 'B';
    const flips: number[] = [];

    for(const [rowDelta, colDelta] of DIRECTIONS) {
      const line: number[] = [];
      let nextRow = row + rowDelta;
      let nextCol = col + colDelta;

      while(nextRow >= 0 && nextRow < ROWS && nextCol >= 0 && nextCol < COLS) {
        const nextIndex = this.getIndex(nextRow, nextCol);
        const cell = this.board[nextIndex];

        if(cell === opponentCell) {
          line.push(nextIndex);
          nextRow += rowDelta;
          nextCol += colDelta;
          continue;
        }

        if(cell === teamCell && line.length > 0) {
          flips.push(...line);
        }

        break;
      }
    }

    return flips;
  }

  private getIndex(row: number, col: number) {
    return (row * COLS) + col;
  }

  private isBoardFull() {
    for(const cell of this.board) {
      if(cell === null) {
        return false;
      }
    }

    return true;
  }
}

export const playOthelloMoves = (moves: ReadonlyArray<number | string>) => {
  let state = new OthelloState();

  for(const move of moves) {
    state = state.makeMove(String(move));
  }

  return state;
};
