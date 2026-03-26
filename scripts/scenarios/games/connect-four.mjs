import { GameState } from '../../../dist/index.js';

const ROWS = 6;
const COLS = 7;
const TOTAL_CELLS = ROWS * COLS;
const WIN_LENGTH = 4;
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

export class ConnectFourState extends GameState {
  constructor(
    board = Array(TOTAL_CELLS).fill(null),
    team = true,
    lastMove = null,
    moveCount = null,
    hasWinner = null,
  ) {
    super();
    this.board = board;
    this.team = team;
    this.lastMove = lastMove;
    this.moveCount = moveCount ?? this.countMoves();
    this.hasWinner = hasWinner ?? this.checkWinnerFromLastMove(lastMove);
  }

  getCurrentTeam() {
    return this.team ? 'R' : 'Y';
  }

  getLegalMoves() {
    const moves = [];

    for(let col = 0; col < COLS; col += 1) {
      if(this.board[this.getIndex(0, col)] === null) {
        moves.push(String(col));
      }
    }

    return moves;
  }

  suggestRollout(random) {
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
        nextBoard[index] = this.team;
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

  sampleLegalMove(random) {
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

  makeMove(move) {
    const column = Number.parseInt(move, 10);
    if(!Number.isInteger(column) || column < 0 || column >= COLS) {
      throw new Error(`Invalid Connect Four move: ${move}`);
    }

    const index = this.findDropIndex(column);
    if(index === null) {
      throw new Error(`Illegal Connect Four move: ${move}`);
    }

    const nextBoard = [...this.board];
    nextBoard[index] = this.team;
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

  toString() {
    const rows = [];

    for(let row = 0; row < ROWS; row += 1) {
      let rowString = '';
      for(let col = 0; col < COLS; col += 1) {
        const cell = this.board[this.getIndex(row, col)];
        rowString += cell === null ? '.' : (cell ? 'R' : 'Y');
      }
      rows.push(rowString);
    }

    return `${this.getCurrentTeam()}: ${rows.join('/')}`;
  }

  getIndex(row, col) {
    return (row * COLS) + col;
  }

  findDropIndex(column) {
    for(let row = ROWS - 1; row >= 0; row -= 1) {
      const index = this.getIndex(row, column);
      if(this.board[index] === null) {
        return index;
      }
    }

    return null;
  }

  checkWinnerFromLastMove(lastMove) {
    if(lastMove === null) {
      return false;
    }

    return this.checkWinnerAt(this.board, lastMove);
  }

  checkWinnerAt(board, index) {
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

  countDirection(board, row, col, rowDelta, colDelta, cell) {
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

  countMoves() {
    let count = 0;

    for(const cell of this.board) {
      if(cell !== null) {
        count += 1;
      }
    }

    return count;
  }
}

export const playConnectFourMoves = (moves) => {
  let state = new ConnectFourState();

  for(const move of moves) {
    state = state.makeMove(String(move));
  }

  return state;
};
