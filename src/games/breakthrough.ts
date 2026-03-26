import { GameState } from '../index.ts';

export type BreakthroughCell = 'W' | 'B' | null;
export type BreakthroughTeam = 'W' | 'B';
export type BreakthroughMove = string;

const ROWS = 8;
const COLS = 8;
const TOTAL_CELLS = ROWS * COLS;

export class BreakthroughState extends GameState<
  BreakthroughMove,
  BreakthroughTeam,
  BreakthroughState
> {
  readonly board: readonly BreakthroughCell[];
  readonly team: boolean;
  readonly lastMove: number | null;
  readonly whiteCount: number;
  readonly blackCount: number;
  readonly winner: BreakthroughTeam | null;

  constructor(
    board: readonly BreakthroughCell[] = BreakthroughState.initializeBoard(),
    team = true,
    lastMove: number | null = null,
    whiteCount: number | null = null,
    blackCount: number | null = null,
    winner: BreakthroughTeam | null = null,
  ) {
    super();
    this.board = [...board];
    this.team = team;
    this.lastMove = lastMove;

    const counts = whiteCount === null || blackCount === null
      ? this.countPieces()
      : { black: blackCount, white: whiteCount };

    this.whiteCount = counts.white;
    this.blackCount = counts.black;
    this.winner = winner ?? this.checkWinnerFromLastMove(lastMove);
  }

  static initializeBoard() {
    const board = Array<BreakthroughCell>(TOTAL_CELLS).fill(null);

    for(let row = 0; row < 2; row += 1) {
      for(let col = 0; col < COLS; col += 1) {
        board[(row * COLS) + col] = 'B';
      }
    }

    for(let row = ROWS - 2; row < ROWS; row += 1) {
      for(let col = 0; col < COLS; col += 1) {
        board[(row * COLS) + col] = 'W';
      }
    }

    return board;
  }

  getCurrentTeam() {
    return this.team ? 'W' : 'B';
  }

  getLegalMoves() {
    const moves: string[] = [];

    for(let index = 0; index < this.board.length; index += 1) {
      if(!this.isCurrentPlayersPiece(index)) {
        continue;
      }

      this.forEachPieceMove(index, (move) => {
        moves.push(`${index}:${move}`);
      });
    }

    return moves;
  }

  override suggestRollout(random: () => number) {
    let legalCount = 0;
    let chosenFrom: number | null = null;
    let chosenTo: number | null = null;

    for(let index = 0; index < this.board.length; index += 1) {
      if(!this.isCurrentPlayersPiece(index)) {
        continue;
      }

      this.forEachPieceMove(index, (move) => {
        legalCount += 1;
        if(Math.floor(random() * legalCount) === 0) {
          chosenFrom = index;
          chosenTo = move;
        }
      });
    }

    if(chosenFrom === null || chosenTo === null) {
      throw new Error('Non-terminal Breakthrough state has no legal moves.');
    }

    return {
      move: `${chosenFrom}:${chosenTo}`,
      nextState: this.applyMove(chosenFrom, chosenTo),
    };
  }

  override sampleLegalMove(random: () => number) {
    let legalCount = 0;
    let chosenMove: string | null = null;

    for(let index = 0; index < this.board.length; index += 1) {
      if(!this.isCurrentPlayersPiece(index)) {
        continue;
      }

      this.forEachPieceMove(index, (move) => {
        legalCount += 1;
        if(Math.floor(random() * legalCount) === 0) {
          chosenMove = `${index}:${move}`;
        }
      });
    }

    if(chosenMove === null) {
      throw new Error('Non-terminal Breakthrough state has no legal moves.');
    }

    return chosenMove;
  }

  makeMove(move: string) {
    const [fromText, toText] = move.split(':');
    const from = Number.parseInt(fromText ?? '', 10);
    const to = Number.parseInt(toText ?? '', 10);
    if(!Number.isInteger(from) || !Number.isInteger(to)) {
      throw new Error(`Invalid Breakthrough move: ${move}`);
    }

    const piece = this.board[from];
    const currentPiece = this.team ? 'W' : 'B';
    const opponentPiece = this.team ? 'B' : 'W';
    if(piece !== currentPiece) {
      throw new Error(`Illegal Breakthrough move: ${move}`);
    }

    const legalDestinations = this.getLegalDestinations(from);
    if(!legalDestinations.includes(to)) {
      throw new Error(`Illegal Breakthrough move: ${move}`);
    }
    const target = this.board[to];
    if(target !== null && target !== opponentPiece) {
      throw new Error(`Illegal Breakthrough move: ${move}`);
    }

    return this.applyMove(from, to);
  }

  isTerminal() {
    return this.winner !== null;
  }

  getReward() {
    if(this.winner === 'W') {
      return { W: 1, B: 0 };
    }

    if(this.winner === 'B') {
      return { W: 0, B: 1 };
    }

    return { W: 0, B: 0 };
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

  private isCurrentPlayersPiece(index: number) {
    return this.board[index] === (this.team ? 'W' : 'B');
  }

  private forEachPieceMove(index: number, visit: (destination: number) => void) {
    for(const destination of this.getLegalDestinations(index)) {
      visit(destination);
    }
  }

  private applyMove(from: number, to: number) {
    const currentPiece = this.team ? 'W' : 'B';
    const target = this.board[to];
    const nextBoard = [...this.board];
    nextBoard[from] = null;
    nextBoard[to] = currentPiece;

    const nextWhiteCount = this.whiteCount - (target === 'W' ? 1 : 0);
    const nextBlackCount = this.blackCount - (target === 'B' ? 1 : 0);
    const winner = this.resolveWinner(to, currentPiece, nextWhiteCount, nextBlackCount);

    return new BreakthroughState(
      nextBoard,
      !this.team,
      to,
      nextWhiteCount,
      nextBlackCount,
      winner,
    );
  }

  private getLegalDestinations(index: number) {
    const row = Math.floor(index / COLS);
    const col = index % COLS;
    const rowDelta = this.team ? -1 : 1;
    const currentPiece = this.team ? 'W' : 'B';
    const opponentPiece = this.team ? 'B' : 'W';
    const nextRow = row + rowDelta;

    if(nextRow < 0 || nextRow >= ROWS || this.board[index] !== currentPiece) {
      return [];
    }

    const destinations: number[] = [];

    const forwardIndex = this.getIndex(nextRow, col);
    if(this.board[forwardIndex] === null) {
      destinations.push(forwardIndex);
    }

    for(const nextCol of [col - 1, col + 1]) {
      if(nextCol < 0 || nextCol >= COLS) {
        continue;
      }

      const targetIndex = this.getIndex(nextRow, nextCol);
      const target = this.board[targetIndex];

      if(target === null || target === opponentPiece) {
        destinations.push(targetIndex);
      }
    }

    return destinations;
  }

  private resolveWinner(
    destination: number,
    piece: BreakthroughTeam,
    whiteCount: number,
    blackCount: number,
  ) {
    const row = Math.floor(destination / COLS);

    if(piece === 'W' && row === 0) {
      return 'W';
    }

    if(piece === 'B' && row === ROWS - 1) {
      return 'B';
    }

    if(whiteCount === 0) {
      return 'B';
    }

    if(blackCount === 0) {
      return 'W';
    }

    return null;
  }

  private checkWinnerFromLastMove(lastMove: number | null) {
    if(lastMove === null) {
      return null;
    }

    const piece = this.board[lastMove];
    if(piece !== 'W' && piece !== 'B') {
      return null;
    }

    return this.resolveWinner(lastMove, piece, this.whiteCount, this.blackCount);
  }

  private countPieces() {
    let white = 0;
    let black = 0;

    for(const cell of this.board) {
      if(cell === 'W') {
        white += 1;
      } else if(cell === 'B') {
        black += 1;
      }
    }

    return { black, white };
  }

  private getIndex(row: number, col: number) {
    return (row * COLS) + col;
  }
}

export const playBreakthroughMoves = (moves: ReadonlyArray<string>) => {
  let state = new BreakthroughState();

  for(const move of moves) {
    state = state.makeMove(move);
  }

  return state;
};
