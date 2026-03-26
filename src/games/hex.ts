import { GameState } from '../index.ts';

export type HexCell = 'B' | 'W' | null;
export type HexTeam = 'B' | 'W';
export type HexMove = number;

const DEFAULT_SIZE = 7;
const NEIGHBOR_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
];

export class HexState extends GameState<HexMove, HexTeam, HexState> {
  readonly board: readonly HexCell[];
  readonly team: boolean;
  readonly lastMove: number | null;
  readonly size: number;
  readonly moveCount: number;
  readonly winner: HexTeam | null;

  constructor(
    board: readonly HexCell[] = Array(DEFAULT_SIZE * DEFAULT_SIZE).fill(null),
    team = true,
    lastMove: number | null = null,
    size = DEFAULT_SIZE,
    moveCount: number | null = null,
    winner: HexTeam | null = null,
  ) {
    super();
    this.board = [...board];
    this.team = team;
    this.lastMove = lastMove;
    this.size = size;
    this.moveCount = moveCount ?? this.countMoves();
    this.winner = winner ?? this.checkWinnerFromLastMove(lastMove);
  }

  getCurrentTeam() {
    return this.team ? 'B' : 'W';
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

  override suggestRollout(random: () => number) {
    const remainingMoves = this.board.length - this.moveCount;
    if(remainingMoves <= 0) {
      throw new Error('Non-terminal Hex state has no legal moves.');
    }

    let target = Math.floor(random() * remainingMoves);
    const nextBoard = [...this.board];

    for(let index = 0; index < this.board.length; index += 1) {
      if(this.board[index] !== null) {
        continue;
      }

      if(target !== 0) {
        target -= 1;
        continue;
      }

      nextBoard[index] = this.team ? 'B' : 'W';
      const winner = this.checkWinnerAt(nextBoard, index, this.team ? 'B' : 'W');
      return {
        move: index,
        nextState: new HexState(
          nextBoard,
          !this.team,
          index,
          this.size,
          this.moveCount + 1,
          winner,
        ),
      };
    }

    throw new Error('Failed to sample a legal Hex move.');
  }

  override sampleLegalMove(random: () => number) {
    const remainingMoves = this.board.length - this.moveCount;
    if(remainingMoves <= 0) {
      throw new Error('Non-terminal Hex state has no legal moves.');
    }

    let target = Math.floor(random() * remainingMoves);

    for(let index = 0; index < this.board.length; index += 1) {
      if(this.board[index] !== null) {
        continue;
      }

      if(target === 0) {
        return index;
      }

      target -= 1;
    }

    throw new Error('Failed to sample a legal Hex move.');
  }

  makeMove(move: number) {
    if(!Number.isInteger(move) || move < 0 || move >= this.board.length) {
      throw new Error(`Invalid Hex move: ${move}`);
    }

    if(this.board[move] !== null) {
      throw new Error(`Illegal Hex move: ${move}`);
    }

    const nextBoard = [...this.board];
    nextBoard[move] = this.team ? 'B' : 'W';
    const winner = this.checkWinnerAt(nextBoard, move, this.team ? 'B' : 'W');

    return new HexState(
      nextBoard,
      !this.team,
      move,
      this.size,
      this.moveCount + 1,
      winner,
    );
  }

  isTerminal() {
    return this.winner !== null || this.moveCount === this.board.length;
  }

  getReward() {
    if(this.winner === 'B') {
      return { B: 1, W: 0 };
    }

    if(this.winner === 'W') {
      return { B: 0, W: 1 };
    }

    return { B: 0, W: 0 };
  }

  override toString() {
    const rows: string[] = [];

    for(let row = 0; row < this.size; row += 1) {
      let rowString = '';

      for(let col = 0; col < this.size; col += 1) {
        rowString += this.board[this.getIndex(row, col)] ?? '.';
      }

      rows.push(rowString);
    }

    return `${this.getCurrentTeam()}: ${rows.join('/')}`;
  }

  private getIndex(row: number, col: number) {
    return (row * this.size) + col;
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

  private checkWinnerFromLastMove(lastMove: number | null) {
    if(lastMove === null) {
      return null;
    }

    const color = this.board[lastMove];
    if(color === null || color === undefined) {
      return null;
    }

    return this.checkWinnerAt(this.board, lastMove, color);
  }

  private checkWinnerAt(board: readonly HexCell[], startIndex: number, color: HexTeam) {
    const stack = [startIndex];
    const visited = new Set([startIndex]);
    let touchesStartEdge = false;
    let touchesEndEdge = false;

    while(stack.length > 0) {
      const index = stack.pop();
      if(index === undefined) {
        continue;
      }

      const row = Math.floor(index / this.size);
      const col = index % this.size;

      if(color === 'B') {
        if(row === 0) {
          touchesStartEdge = true;
        }
        if(row === this.size - 1) {
          touchesEndEdge = true;
        }
      } else {
        if(col === 0) {
          touchesStartEdge = true;
        }
        if(col === this.size - 1) {
          touchesEndEdge = true;
        }
      }

      if(touchesStartEdge && touchesEndEdge) {
        return color;
      }

      for(const [rowDelta, colDelta] of NEIGHBOR_DELTAS) {
        const nextRow = row + rowDelta;
        const nextCol = col + colDelta;
        if(
          nextRow < 0
          || nextRow >= this.size
          || nextCol < 0
          || nextCol >= this.size
        ) {
          continue;
        }

        const nextIndex = this.getIndex(nextRow, nextCol);
        if(board[nextIndex] !== color || visited.has(nextIndex)) {
          continue;
        }

        visited.add(nextIndex);
        stack.push(nextIndex);
      }
    }

    return null;
  }
}

export const playHexMoves = (moves: ReadonlyArray<number>, size = DEFAULT_SIZE) => {
  let state = new HexState(Array(size * size).fill(null), true, null, size);

  for(const move of moves) {
    state = state.makeMove(move);
  }

  return state;
};
