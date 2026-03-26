export type RewardInput<TTeam> =
  | number
  | ReadonlyMap<TTeam, number>
  | Readonly<Record<string, number>>;

export interface RolloutSuggestion<TMove, TState> {
  move: TMove;
  nextState: TState;
}

export interface SearchLimits {
  maxIterations?: number;
  maxTimeMs?: number;
}

export interface SearchMetrics {
  elapsedMs: number;
  iterations: number;
}

export interface SearchNodeStats<TMove, TTeam> {
  averageReward: number;
  children: SearchNodeStats<TMove, TTeam>[] | '[max depth reached]';
  isFullyExpanded: boolean;
  isTerminal: boolean;
  move: TMove | null;
  rewards: Array<[TTeam, number]>;
  state: string;
  team: TTeam;
  visits: number;
}

export interface SearchResult<TState, TMove, TTeam> extends SearchMetrics {
  bestChild: SearchNode<TState, TMove, TTeam> | null;
  bestMove: TMove | null;
  root: SearchNode<TState, TMove, TTeam>;
}

export interface MCTSOptions<TState, TMove, TTeam> {
  explorationBias?: number;
  now?: () => number;
  random?: () => number;
  stateKey?: (state: TState) => string;
}

export abstract class GameState<
  TMove = string,
  TTeam = string,
  TState extends GameState<TMove, TTeam, TState> = any,
> {
  abstract getCurrentTeam(): TTeam;
  abstract getLegalMoves(): readonly TMove[];
  abstract makeMove(move: TMove): TState;
  abstract isTerminal(): boolean;
  abstract getReward(terminalTeam: TTeam): RewardInput<TTeam>;

  suggestRollout(): RolloutSuggestion<TMove, TState> | null {
    return null;
  }

  getStateKey(): string {
    return this.toString();
  }
}

const shuffleInPlace = <T>(items: T[], random: () => number) => {
  for(let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
};

const assertPositiveInteger = (value: number, label: string) => {
  if(!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
};

const assertPositiveNumber = (value: number, label: string) => {
  if(!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
};

const validateLimits = (limits: SearchLimits): Required<SearchLimits> => {
  const { maxIterations, maxTimeMs } = limits;

  if(maxIterations === undefined && maxTimeMs === undefined) {
    throw new Error('At least one of maxIterations or maxTimeMs is required.');
  }

  if(maxIterations !== undefined) {
    assertPositiveInteger(maxIterations, 'maxIterations');
  }

  if(maxTimeMs !== undefined) {
    assertPositiveNumber(maxTimeMs, 'maxTimeMs');
  }

  return {
    maxIterations: maxIterations ?? 0,
    maxTimeMs: maxTimeMs ?? 0,
  };
};

const rewardEntries = <TTeam>(rewards: RewardInput<TTeam>, terminalTeam: TTeam) => {
  if(typeof rewards === 'number') {
    return new Map<TTeam, number>([[terminalTeam, rewards]]);
  }

  if(rewards instanceof Map) {
    return new Map<TTeam, number>(rewards.entries());
  }

  return new Map<TTeam, number>(
    Object.entries(rewards).map(([team, reward]) => [team as TTeam, reward]),
  );
};

const stateToString = (state: unknown) => {
  if(
    typeof state === 'object'
    && state !== null
    && 'toString' in state
    && typeof state.toString === 'function'
  ) {
    return state.toString();
  }

  return String(state);
};

export class SearchNode<TState, TMove, TTeam> {
  averageReward: number;
  readonly children: Map<TMove, SearchNode<TState, TMove, TTeam>>;
  isFullyExpanded: boolean;
  readonly isTerminal: boolean;
  readonly move: TMove | null;
  parent: SearchNode<TState, TMove, TTeam> | null;
  readonly remainingMoves: TMove[];
  readonly rewards: Map<TTeam, number>;
  readonly state: TState;
  readonly team: TTeam;
  private totalReward: number;
  visits: number;

  constructor(
    state: TState & {
      getCurrentTeam(): TTeam;
      getLegalMoves(): readonly TMove[];
      isTerminal(): boolean;
    },
    random: () => number,
    parent: SearchNode<TState, TMove, TTeam> | null = null,
    move: TMove | null = null,
  ) {
    this.state = state;
    this.parent = parent;
    this.move = move;
    this.children = new Map();
    this.visits = 0;
    this.rewards = new Map();
    this.totalReward = 0;
    this.averageReward = 0;
    this.isTerminal = state.isTerminal();
    this.isFullyExpanded = this.isTerminal;

    if(this.isTerminal) {
      this.remainingMoves = [];
    } else {
      this.remainingMoves = [...state.getLegalMoves()];
      if(this.remainingMoves.length === 0) {
        throw new Error('Non-terminal state has no legal moves.');
      }
      shuffleInPlace(this.remainingMoves, random);
    }

    this.team = state.getCurrentTeam();

    if(this.parent) {
      this.rewards.set(this.parent.team, 0);
    }
  }

  visit(rewards: ReadonlyMap<TTeam, number>) {
    this.visits += 1;

    for(const [team, reward] of rewards.entries()) {
      this.rewards.set(team, (this.rewards.get(team) ?? 0) + reward);
      this.totalReward += reward;
    }

    if(this.parent) {
      const parentReward = this.rewards.get(this.parent.team) ?? 0;
      this.averageReward = ((2 * parentReward) - this.totalReward) / this.visits;
    }
  }

  calcScore(explorationBias: number) {
    if(!this.parent) {
      return this.averageReward;
    }

    if(this.visits === 0 || this.parent.visits === 0) {
      return Number.POSITIVE_INFINITY;
    }

    return this.averageReward
      + (explorationBias * Math.sqrt(Math.log(this.parent.visits) / this.visits));
  }

  getStats(depth = 0): SearchNodeStats<TMove, TTeam> {
    const childStats = depth > 0
      ? [...this.children.values()]
        .sort((left, right) => right.visits - left.visits)
        .map((child) => child.getStats(depth - 1))
      : '[max depth reached]';

    return {
      averageReward: this.averageReward,
      children: childStats,
      isFullyExpanded: this.isFullyExpanded,
      isTerminal: this.isTerminal,
      move: this.move,
      rewards: [...this.rewards.entries()],
      state: stateToString(this.state),
      team: this.team,
      visits: this.visits,
    };
  }
}

export class MCTS<
  TState extends GameState<TMove, TTeam, TState>,
  TMove = string,
  TTeam = string,
> {
  readonly explorationBias: number;
  root: SearchNode<TState, TMove, TTeam> | null;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly stateKey?: (state: TState) => string;

  constructor(options: number | MCTSOptions<TState, TMove, TTeam> = {}) {
    const resolvedOptions = typeof options === 'number'
      ? { explorationBias: options }
      : options;

    const explorationBias = resolvedOptions.explorationBias ?? Math.SQRT2;
    if(!Number.isFinite(explorationBias) || explorationBias < 0) {
      throw new Error('explorationBias must be a non-negative number.');
    }

    this.explorationBias = explorationBias;
    this.random = resolvedOptions.random ?? Math.random;
    this.now = resolvedOptions.now ?? (() => performance.now());
    this.stateKey = resolvedOptions.stateKey;
    this.root = null;
  }

  reset() {
    this.root = null;
  }

  initializeRoot(state: TState) {
    this.root = new SearchNode(state, this.random);
    return this.root;
  }

  ensureRoot(state: TState) {
    if(!this.root || !this.statesMatch(this.root.state, state)) {
      return this.initializeRoot(state);
    }

    return this.root;
  }

  search(state: TState, limits: SearchLimits): SearchResult<TState, TMove, TTeam> {
    const validatedLimits = validateLimits(limits);
    const root = this.ensureRoot(state);

    if(root.isTerminal) {
      throw new Error('Cannot search a terminal state.');
    }

    const startTime = this.now();
    const endTime = validatedLimits.maxTimeMs > 0
      ? startTime + validatedLimits.maxTimeMs
      : Number.POSITIVE_INFINITY;

    let iterations = 0;

    do {
      this.executeRound(root);
      iterations += 1;
    } while(
      (validatedLimits.maxIterations === 0 || iterations < validatedLimits.maxIterations)
      && this.now() < endTime
    );

    return {
      bestChild: this.getBestChild(root, 0),
      bestMove: this.getBestMove(root),
      elapsedMs: this.now() - startTime,
      iterations,
      root,
    };
  }

  executeRound(root: SearchNode<TState, TMove, TTeam> | null = this.root) {
    if(!root) {
      throw new Error('Cannot execute a round without a root node.');
    }

    const node = this.select(root);
    const rewards = this.simulate(node);
    this.backpropagate(node, rewards);
  }

  getBestChild(
    node: SearchNode<TState, TMove, TTeam> | null = this.root,
    explorationBias = this.explorationBias,
  ) {
    if(!node || node.children.size === 0) {
      return null;
    }

    let bestChild: SearchNode<TState, TMove, TTeam> | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for(const child of node.children.values()) {
      const score = child.calcScore(explorationBias);
      if(score > bestScore) {
        bestScore = score;
        bestChild = child;
      }
    }

    return bestChild;
  }

  getBestMove(node: SearchNode<TState, TMove, TTeam> | null = this.root) {
    return this.getBestChild(node, 0)?.move ?? null;
  }

  advanceToChild(move: TMove, nextState?: TState) {
    if(!this.root) {
      return null;
    }

    const child = this.root.children.get(move) ?? null;
    if(!child) {
      return null;
    }

    if(nextState && !this.statesMatch(child.state, nextState)) {
      return null;
    }

    child.parent = null;
    this.root = child;
    return child;
  }

  private select(node: SearchNode<TState, TMove, TTeam>) {
    let currentNode = node;

    while(!currentNode.isTerminal) {
      if(!currentNode.isFullyExpanded) {
        return this.expand(currentNode);
      }

      const bestChild = this.getBestChild(currentNode);
      if(!bestChild) {
        throw new Error('Fully-expanded node has no children.');
      }

      currentNode = bestChild;
    }

    return currentNode;
  }

  private expand(node: SearchNode<TState, TMove, TTeam>) {
    const move = node.remainingMoves.pop();
    if(move === undefined) {
      throw new Error('Cannot expand a node with no remaining moves.');
    }

    if(node.remainingMoves.length === 0) {
      node.isFullyExpanded = true;
    }

    const childState = node.state.makeMove(move);
    const childNode = new SearchNode(childState, this.random, node, move);
    node.children.set(move, childNode);
    return childNode;
  }

  private simulate(node: SearchNode<TState, TMove, TTeam>) {
    if(node.isTerminal) {
      if(!node.parent) {
        throw new Error('Cannot simulate from a terminal root node.');
      }

      return rewardEntries(node.state.getReward(node.parent.team), node.parent.team);
    }

    let state = node.state;
    let terminalTeam = node.parent ? node.parent.team : node.team;

    while(!state.isTerminal()) {
      const suggestion = state.suggestRollout();
      terminalTeam = state.getCurrentTeam();

      if(suggestion) {
        state = suggestion.nextState;
        continue;
      }

      const legalMoves = state.getLegalMoves();
      if(legalMoves.length === 0) {
        throw new Error('Non-terminal state has no legal moves.');
      }

      const move = legalMoves[Math.floor(this.random() * legalMoves.length)];
      state = state.makeMove(move);
    }

    return rewardEntries(state.getReward(terminalTeam), terminalTeam);
  }

  private backpropagate(
    node: SearchNode<TState, TMove, TTeam>,
    rewards: ReadonlyMap<TTeam, number>,
  ) {
    let currentNode: SearchNode<TState, TMove, TTeam> | null = node;

    while(currentNode) {
      currentNode.visit(rewards);
      currentNode = currentNode.parent;
    }
  }

  private resolveStateKey(state: TState) {
    if(this.stateKey) {
      return this.stateKey(state);
    }

    return state.getStateKey();
  }

  private statesMatch(left: TState, right: TState) {
    if(left === right) {
      return true;
    }

    return this.resolveStateKey(left) === this.resolveStateKey(right);
  }
}
