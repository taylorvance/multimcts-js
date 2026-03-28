import { GameState } from '../index.ts';

export type IsolationTeam = 'A' | 'B' | 'C';
export type IsolationMove = number;
export type IsolationCell = IsolationTeam | '#' | null;

const DEFAULT_SIZE = 7;
const BLOCKED_CELL = '#';
const TEAMS: readonly IsolationTeam[] = ['A', 'B', 'C'];
const NEIGHBOR_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

type IsolationPositions = Record<IsolationTeam, number | null>;

const createEmptyPositions = (): IsolationPositions => ({
  A: null,
  B: null,
  C: null,
});

const getIndex = (row: number, col: number, size: number) => (row * size) + col;

const createStartingBoard = (size: number) => {
  if(size < 5) {
    throw new Error('Isolation size must be at least 5 for the default starting layout.');
  }

  const board = Array<IsolationCell>(size * size).fill(null);
  const middleCol = Math.floor(size / 2);
  board[getIndex(1, middleCol, size)] = 'A';
  board[getIndex(size - 2, 1, size)] = 'B';
  board[getIndex(size - 2, size - 2, size)] = 'C';
  return board;
};

export class IsolationState extends GameState<IsolationMove, IsolationTeam, IsolationState> {
  readonly board: readonly IsolationCell[];
  readonly positions: Readonly<IsolationPositions>;
  readonly size: number;
  readonly team: IsolationTeam;
  readonly winner: IsolationTeam | null;

  constructor(
    board: readonly IsolationCell[] | null = null,
    team: IsolationTeam = 'A',
    size = DEFAULT_SIZE,
    winner: IsolationTeam | null = null,
  ) {
    super();
    const resolvedBoard = board === null ? createStartingBoard(size) : [...board];
    if(resolvedBoard.length !== size * size) {
      throw new Error(`Isolation board must have exactly ${size * size} cells.`);
    }

    this.board = resolvedBoard;
    this.size = size;
    this.team = team;
    this.positions = this.findPositions();
    this.winner = winner ?? this.resolveWinner();

    if(this.winner === null) {
      if(this.positions[this.team] === null) {
        throw new Error(`Isolation current team "${this.team}" is not active in this state.`);
      }

      if(!this.hasAnyLegalMove(this.board, this.positions[this.team]!)) {
        throw new Error(
          `Isolation current team "${this.team}" must have at least one legal move in a non-terminal state.`,
        );
      }
    }
  }

  getCurrentTeam() {
    return this.team;
  }

  getLegalMoves() {
    if(this.winner !== null) {
      return [];
    }

    const from = this.positions[this.team];
    if(from === null) {
      throw new Error(`Isolation current team "${this.team}" is not active in this state.`);
    }

    const moves: number[] = [];
    this.forEachLegalDestination(this.board, from, (move) => {
      moves.push(move);
    });
    return moves;
  }

  override suggestRollout(random: () => number) {
    const move = this.sampleLegalMove(random);
    return {
      move,
      nextState: this.makeMove(move),
    };
  }

  override sampleLegalMove(random: () => number) {
    if(this.winner !== null) {
      throw new Error('Terminal Isolation state has no legal moves.');
    }

    const from = this.positions[this.team];
    if(from === null) {
      throw new Error(`Isolation current team "${this.team}" is not active in this state.`);
    }

    let legalCount = 0;
    let chosenMove: number | null = null;

    this.forEachLegalDestination(this.board, from, (move) => {
      legalCount += 1;
      if(Math.floor(random() * legalCount) === 0) {
        chosenMove = move;
      }
    });

    if(chosenMove === null) {
      throw new Error('Non-terminal Isolation state has no legal moves.');
    }

    return chosenMove;
  }

  makeMove(move: number) {
    if(this.winner !== null) {
      throw new Error('Cannot move from a terminal Isolation state.');
    }

    if(!Number.isInteger(move) || move < 0 || move >= this.board.length) {
      throw new Error(`Invalid Isolation move: ${move}`);
    }

    const from = this.positions[this.team];
    if(from === null) {
      throw new Error(`Isolation current team "${this.team}" is not active in this state.`);
    }

    if(!this.isLegalDestination(this.board, from, move)) {
      throw new Error(`Illegal Isolation move: ${move}`);
    }

    const nextBoard = [...this.board];
    nextBoard[from] = BLOCKED_CELL;
    nextBoard[move] = this.team;

    return this.advanceTurn(nextBoard, this.nextTeamAfter(this.team));
  }

  isTerminal() {
    return this.winner !== null;
  }

  getReward() {
    return {
      A: this.winner === 'A' ? 1 : 0,
      B: this.winner === 'B' ? 1 : 0,
      C: this.winner === 'C' ? 1 : 0,
    };
  }

  override toString() {
    const rows: string[] = [];

    for(let row = 0; row < this.size; row += 1) {
      let rowString = '';

      for(let col = 0; col < this.size; col += 1) {
        rowString += this.board[getIndex(row, col, this.size)] ?? '.';
      }

      rows.push(rowString);
    }

    return `${this.team}: ${rows.join('/')}`;
  }

  private findPositions() {
    const positions = createEmptyPositions();

    for(let index = 0; index < this.board.length; index += 1) {
      const cell = this.board[index];
      if(cell !== 'A' && cell !== 'B' && cell !== 'C') {
        continue;
      }

      if(positions[cell] !== null) {
        throw new Error(`Isolation board contains more than one piece for team "${cell}".`);
      }

      positions[cell] = index;
    }

    return positions;
  }

  private resolveWinner() {
    const activeTeams = TEAMS.filter((candidate) => this.positions[candidate] !== null);
    return activeTeams.length === 1 ? (activeTeams[0] ?? null) : null;
  }

  private nextTeamAfter(team: IsolationTeam) {
    const teamIndex = TEAMS.indexOf(team);
    return TEAMS[(teamIndex + 1) % TEAMS.length]!;
  }

  private advanceTurn(board: IsolationCell[], nextTeam: IsolationTeam) {
    const positions = this.findPositionsForBoard(board);
    let remainingTeams = TEAMS.filter((candidate) => positions[candidate] !== null).length;

    if(remainingTeams <= 1) {
      const winner = TEAMS.find((candidate) => positions[candidate] !== null) ?? null;
      return new IsolationState(board, winner ?? nextTeam, this.size, winner);
    }

    let currentIndex = TEAMS.indexOf(nextTeam);

    for(let checks = 0; checks < TEAMS.length; checks += 1) {
      const candidate = TEAMS[currentIndex]!;
      const position = positions[candidate];

      if(position !== null) {
        if(this.hasAnyLegalMove(board, position)) {
          return new IsolationState(board, candidate, this.size);
        }

        board[position] = BLOCKED_CELL;
        positions[candidate] = null;
        remainingTeams -= 1;

        if(remainingTeams <= 1) {
          const winner = TEAMS.find((teamName) => positions[teamName] !== null) ?? null;
          return new IsolationState(board, winner ?? candidate, this.size, winner);
        }
      }

      currentIndex = (currentIndex + 1) % TEAMS.length;
    }

    throw new Error('Failed to resolve the next active Isolation team.');
  }

  private findPositionsForBoard(board: readonly IsolationCell[]) {
    const positions = createEmptyPositions();

    for(let index = 0; index < board.length; index += 1) {
      const cell = board[index];
      if(cell !== 'A' && cell !== 'B' && cell !== 'C') {
        continue;
      }

      positions[cell] = index;
    }

    return positions;
  }

  private hasAnyLegalMove(board: readonly IsolationCell[], from: number) {
    let foundMove = false;
    this.forEachLegalDestination(board, from, () => {
      foundMove = true;
    });
    return foundMove;
  }

  private isLegalDestination(board: readonly IsolationCell[], from: number, to: number) {
    let legal = false;
    this.forEachLegalDestination(board, from, (destination) => {
      if(destination === to) {
        legal = true;
      }
    });
    return legal;
  }

  private forEachLegalDestination(
    board: readonly IsolationCell[],
    from: number,
    visit: (destination: number) => void,
  ) {
    const row = Math.floor(from / this.size);
    const col = from % this.size;

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

      const nextIndex = getIndex(nextRow, nextCol, this.size);
      if(board[nextIndex] === null) {
        visit(nextIndex);
      }
    }
  }
}

export const playIsolationMoves = (
  moves: ReadonlyArray<number | string>,
  size = DEFAULT_SIZE,
) => {
  let state = new IsolationState(null, 'A', size);

  for(const move of moves) {
    const parsedMove = typeof move === 'number'
      ? move
      : Number.parseInt(move, 10);
    if(!Number.isInteger(parsedMove)) {
      throw new Error(`Invalid Isolation move: ${String(move)}`);
    }

    state = state.makeMove(parsedMove);
  }

  return state;
};

export default IsolationState;
