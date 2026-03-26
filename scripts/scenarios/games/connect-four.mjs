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
  ) {
    super();
    this.board = board;
    this.team = team;
    this.lastMove = lastMove;
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

    for(let row = ROWS - 1; row >= 0; row -= 1) {
      const index = this.getIndex(row, column);
      if(this.board[index] !== null) {
        continue;
      }

      const nextBoard = [...this.board];
      nextBoard[index] = this.team;
      return new ConnectFourState(nextBoard, !this.team, index);
    }

    throw new Error(`Illegal Connect Four move: ${move}`);
  }

  isTerminal() {
    return this.getWinningLine() !== null || this.board.every((cell) => cell !== null);
  }

  getReward() {
    return this.getWinningLine() ? 1 : 0;
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

  getWinningLine() {
    for(let row = 0; row < ROWS; row += 1) {
      for(let col = 0; col < COLS; col += 1) {
        const startIndex = this.getIndex(row, col);
        const cell = this.board[startIndex];
        if(cell === null) {
          continue;
        }

        for(const [rowDelta, colDelta] of DIRECTIONS) {
          const line = [startIndex];

          for(let step = 1; step < WIN_LENGTH; step += 1) {
            const nextRow = row + (rowDelta * step);
            const nextCol = col + (colDelta * step);
            if(
              nextRow < 0
              || nextRow >= ROWS
              || nextCol < 0
              || nextCol >= COLS
            ) {
              line.length = 0;
              break;
            }

            const index = this.getIndex(nextRow, nextCol);
            if(this.board[index] !== cell) {
              line.length = 0;
              break;
            }

            line.push(index);
          }

          if(line.length === WIN_LENGTH) {
            return line;
          }
        }
      }
    }

    return null;
  }

  getIndex(row, col) {
    return (row * COLS) + col;
  }
}

export const playConnectFourMoves = (moves) => {
  let state = new ConnectFourState();

  for(const move of moves) {
    state = state.makeMove(String(move));
  }

  return state;
};
