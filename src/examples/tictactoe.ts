import { GameState } from '../index.js';

export type TicTacToeCell = 'X' | 'O' | null;
export type TicTacToeTeam = 'X' | 'O';
export type TicTacToeMove = number;

const WINNING_LINES: Array<[number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export class TicTacToeState extends GameState<TicTacToeMove, TicTacToeTeam, TicTacToeState> {
  readonly board: readonly TicTacToeCell[];
  readonly team: TicTacToeTeam;

  constructor(
    board: readonly TicTacToeCell[] = Array<TicTacToeCell>(9).fill(null),
    team: TicTacToeTeam = 'X',
  ) {
    super();
    this.board = [...board];
    this.team = team;
  }

  getCurrentTeam() {
    return this.team;
  }

  getLegalMoves() {
    const moves: number[] = [];

    for(let index = 0; index < this.board.length; index += 1) {
      if(this.board[index] === null) {
        moves.push(index);
      }
    }

    return moves;
  }

  makeMove(move: number) {
    if(!Number.isInteger(move) || move < 0 || move >= this.board.length) {
      throw new Error(`Invalid Tic-Tac-Toe move: ${move}`);
    }

    if(this.board[move] !== null) {
      throw new Error(`Illegal Tic-Tac-Toe move: ${move}`);
    }

    const nextBoard = [...this.board];
    nextBoard[move] = this.team;
    return new TicTacToeState(nextBoard, this.team === 'X' ? 'O' : 'X');
  }

  isTerminal() {
    return this.getWinner() !== null || this.board.every((cell) => cell !== null);
  }

  getReward(_terminalTeam: TicTacToeTeam) {
    return this.getWinner() ? 1 : 0;
  }

  getWinner(): TicTacToeTeam | null {
    for(const [a, b, c] of WINNING_LINES) {
      if(this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
        return this.board[a];
      }
    }

    return null;
  }

  override toString() {
    const rows: string[] = [];

    for(let row = 0; row < 3; row += 1) {
      const start = row * 3;
      rows.push(
        this.board
          .slice(start, start + 3)
          .map((cell) => cell ?? '_')
          .join(''),
      );
    }

    return `${this.team}: ${rows.join('/')}`;
  }
}

export default TicTacToeState;
