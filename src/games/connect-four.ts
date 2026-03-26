import { GameState } from '../index.ts';

export type ConnectFourCell = 'R' | 'Y' | null;
export type ConnectFourTeam = 'R' | 'Y';
export type ConnectFourMove = string;

const ROWS = 6;
const COLS = 7;
const TOTAL_CELLS = ROWS * COLS;
const WIN_LENGTH = 4;
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

export class ConnectFourState extends GameState<
  ConnectFourMove,
  ConnectFourTeam,
  ConnectFourState
> {
  readonly board: readonly ConnectFourCell[];
  readonly team: boolean;
  readonly lastMove: number | null;
  readonly moveCount: number;
  readonly hasWinner: boolean;

  constructor(
    board: readonly ConnectFourCell[] = Array(TOTAL_CELLS).fill(null),
    team = true,
    lastMove: number | null = null,
    moveCount: number | null = null,
    hasWinner: boolean | null = null,
  ) {
    super();
    this.board = [...board];
    this.team = team;
    this.lastMove = lastMove;
    this.moveCount = moveCount ?? this.countMoves();
    this.hasWinner = hasWinner ?? this.checkWinnerFromLastMove(lastMove);
  }

  getCurrentTeam() {
    return this.team ? 'R' : 'Y';
  }

  getLegalMoves() {
    const moves: string[] = [];

    for(let col = 0; col < COLS; col += 1) {
      if(this.board[this.getIndex(0, col)] === null) {
        moves.push(String(col));
      }
    }

    return moves;
  }

  override suggestRollout(random: () => number) {
    let legalCount = 0;

    for(let col = 0; col < COLS; col += 1) {
      if(this.board[this.getIndex(0, col)] === null) {
        legalCount += 1;
      }
    }

    if(legalCount === 0) {
      throw new Error('Non-terminal Connect Four state has no legal moves.');
    }

    let target = Math.floor(random() * legalCount);

    for(let col = 0; col < COLS; col += 1) {
      if(this.board[this.getIndex(0, col)] !== null) {
        continue;
      }

      if(target !== 0) {
        target -= 1;
        continue;
      }

      for(let row = ROWS - 1; row >= 0; row -= 1) {
        const index = this.getIndex(row, col);
        if(this.board[index] !== null) {
          continue;
        }

        const nextBoard = [...this.board];
        nextBoard[index] = this.team ? 'R' : 'Y';
        const hasWinner = this.checkWinnerAt(nextBoard, index);

        return {
          move: String(col),
          nextState: new ConnectFourState(
            nextBoard,
            !this.team,
            index,
            this.moveCount + 1,
            hasWinner,
          ),
        };
      }

      throw new Error(`Failed to apply sampled Connect Four move: ${col}`);
    }

    throw new Error('Failed to sample a legal Connect Four move.');
  }

  override sampleLegalMove(random: () => number) {
    let legalCount = 0;

    for(let col = 0; col < COLS; col += 1) {
      if(this.board[this.getIndex(0, col)] === null) {
        legalCount += 1;
      }
    }

    if(legalCount === 0) {
      throw new Error('Non-terminal Connect Four state has no legal moves.');
    }

    let target = Math.floor(random() * legalCount);

    for(let col = 0; col < COLS; col += 1) {
      if(this.board[this.getIndex(0, col)] !== null) {
        continue;
      }

      if(target === 0) {
        return String(col);
      }

      target -= 1;
    }

    throw new Error('Failed to sample a legal Connect Four move.');
  }

  makeMove(move: string) {
    const column = Number.parseInt(move, 10);
    if(!Number.isInteger(column) || column < 0 || column >= COLS) {
      throw new Error(`Invalid Connect Four move: ${move}`);
    }

    const index = this.findDropIndex(column);
    if(index === null) {
      throw new Error(`Illegal Connect Four move: ${move}`);
    }

    const nextBoard = [...this.board];
    nextBoard[index] = this.team ? 'R' : 'Y';
    return new ConnectFourState(
      nextBoard,
      !this.team,
      index,
      this.moveCount + 1,
      this.checkWinnerAt(nextBoard, index),
    );
  }

  isTerminal() {
    return this.hasWinner || this.moveCount === TOTAL_CELLS;
  }

  getReward() {
    return this.hasWinner ? 1 : 0;
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

  private getIndex(row: number, col: number) {
    return (row * COLS) + col;
  }

  private findDropIndex(column: number) {
    for(let row = ROWS - 1; row >= 0; row -= 1) {
      const index = this.getIndex(row, column);
      if(this.board[index] === null) {
        return index;
      }
    }

    return null;
  }

  private checkWinnerFromLastMove(lastMove: number | null) {
    if(lastMove === null) {
      return false;
    }

    return this.checkWinnerAt(this.board, lastMove);
  }

  private checkWinnerAt(board: readonly ConnectFourCell[], index: number) {
    const cell = board[index];
    if(cell === null || cell === undefined) {
      return false;
    }

    const row = Math.floor(index / COLS);
    const col = index % COLS;

    for(const [rowDelta, colDelta] of DIRECTIONS) {
      let runLength = 1;
      runLength += this.countDirection(board, row, col, rowDelta, colDelta, cell);
      runLength += this.countDirection(board, row, col, -rowDelta, -colDelta, cell);

      if(runLength >= WIN_LENGTH) {
        return true;
      }
    }

    return false;
  }

  private countDirection(
    board: readonly ConnectFourCell[],
    row: number,
    col: number,
    rowDelta: number,
    colDelta: number,
    cell: 'R' | 'Y',
  ) {
    let count = 0;
    let nextRow = row + rowDelta;
    let nextCol = col + colDelta;

    while(
      nextRow >= 0
      && nextRow < ROWS
      && nextCol >= 0
      && nextCol < COLS
      && board[this.getIndex(nextRow, nextCol)] === cell
    ) {
      count += 1;
      nextRow += rowDelta;
      nextCol += colDelta;
    }

    return count;
  }

  private countMoves() {
    let count = 0;

    for(const cell of this.board) {
      if(cell !== null) {
        count += 1;
      }
    }

    return count;
  }
}

export const playConnectFourMoves = (moves: ReadonlyArray<number | string>) => {
  let state = new ConnectFourState();

  for(const move of moves) {
    state = state.makeMove(String(move));
  }

  return state;
};
