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

export type FinalActionStrategy =
  | 'maxChild'
  | 'robustChild'
  | 'maxRobustChild'
  | 'secureChild';

export interface SearchDiagnostics {
  createdNodes: number;
  expandedNodes: number;
  maxRolloutDepth: number;
  maxSelectDepth: number;
  retainedNodeCount: number;
  rootReused: boolean;
  rolloutDepthTotal: number;
  rolloutSimulationCount: number;
  selectDepthTotal: number;
  terminalSimulationCount: number;
  treeMaxDepth: number;
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
  diagnostics?: SearchDiagnostics;
  finalActionStrategy: FinalActionStrategy;
  maxChild: SearchNode<TState, TMove, TTeam> | null;
  root: SearchNode<TState, TMove, TTeam>;
  robustChild: SearchNode<TState, TMove, TTeam> | null;
  secureChild: SearchNode<TState, TMove, TTeam> | null;
}

export interface MCTSOptions<TState, TMove, TTeam> {
  explorationBias?: number;
  finalActionStrategy?: FinalActionStrategy;
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

  selectRolloutMove(_random: () => number): TMove | null {
    return null;
  }

  getStateKey(): string {
    return this.toString();
  }
}

const shuffleInPlace = <T>(items: T[], random: () => number) => {
  for(let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const currentItem = items[index];
    const swapItem = items[swapIndex];

    if(currentItem === undefined || swapItem === undefined) {
      throw new Error('Shuffle attempted to access an out-of-bounds item.');
    }

    items[index] = swapItem;
    items[swapIndex] = currentItem;
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

const createSearchDiagnostics = (): SearchDiagnostics => ({
  createdNodes: 0,
  expandedNodes: 0,
  maxRolloutDepth: 0,
  maxSelectDepth: 0,
  retainedNodeCount: 0,
  rootReused: false,
  rolloutDepthTotal: 0,
  rolloutSimulationCount: 0,
  selectDepthTotal: 0,
  terminalSimulationCount: 0,
  treeMaxDepth: 0,
});

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
  private inverseSqrtVisits: number;
  private sqrtLogVisits: number;
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
    this.sqrtLogVisits = 0;
    this.inverseSqrtVisits = 0;
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
    this.sqrtLogVisits = Math.sqrt(Math.log(this.visits));
    this.inverseSqrtVisits = 1 / Math.sqrt(this.visits);

    for(const [team, reward] of rewards.entries()) {
      this.rewards.set(team, (this.rewards.get(team) ?? 0) + reward);
      this.totalReward += reward;
    }

    if(this.parent) {
      const parentReward = this.rewards.get(this.parent.team) ?? 0;
      this.averageReward = ((2 * parentReward) - this.totalReward) / this.visits;
    }
  }

  uncertainty(explorationBias: number) {
    if(!this.parent || this.visits === 0 || this.parent.visits === 0) {
      return Number.POSITIVE_INFINITY;
    }

    return explorationBias * this.parent.sqrtLogVisits * this.inverseSqrtVisits;
  }

  calcScore(explorationBias: number) {
    if(!this.parent) {
      return this.averageReward;
    }

    if(this.visits === 0 || this.parent.visits === 0) {
      return Number.POSITIVE_INFINITY;
    }

    return this.averageReward + this.uncertainty(explorationBias);
  }

  lowerConfidenceBound(explorationBias: number) {
    if(!this.parent) {
      return this.averageReward;
    }

    return this.averageReward - this.uncertainty(explorationBias);
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

const finalizeSearchDiagnostics = <TState, TMove, TTeam>(
  root: SearchNode<TState, TMove, TTeam>,
  diagnostics: SearchDiagnostics,
) => {
  let retainedNodeCount = 0;
  let treeMaxDepth = 0;
  const stack: Array<{ depth: number; node: SearchNode<TState, TMove, TTeam> }> = [
    { depth: 0, node: root },
  ];

  while(stack.length > 0) {
    const current = stack.pop();
    if(!current) {
      continue;
    }

    retainedNodeCount += 1;
    if(current.depth > treeMaxDepth) {
      treeMaxDepth = current.depth;
    }

    for(const child of current.node.children.values()) {
      stack.push({ depth: current.depth + 1, node: child });
    }
  }

  diagnostics.retainedNodeCount = retainedNodeCount;
  diagnostics.treeMaxDepth = treeMaxDepth;
};

export class MCTS<
  TState extends GameState<TMove, TTeam, TState>,
  TMove = string,
  TTeam = string,
> {
  readonly explorationBias: number;
  readonly finalActionStrategy: FinalActionStrategy;
  root: SearchNode<TState, TMove, TTeam> | null;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly stateKey: ((state: TState) => string) | undefined;

  constructor(options: number | MCTSOptions<TState, TMove, TTeam> = {}) {
    const resolvedOptions = typeof options === 'number'
      ? { explorationBias: options }
      : options;

    const explorationBias = resolvedOptions.explorationBias ?? Math.SQRT2;
    if(!Number.isFinite(explorationBias) || explorationBias < 0) {
      throw new Error('explorationBias must be a non-negative number.');
    }

    this.explorationBias = explorationBias;
    this.finalActionStrategy = resolvedOptions.finalActionStrategy ?? 'robustChild';
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
      return {
        reused: false,
        root: this.initializeRoot(state),
      };
    }

    return {
      reused: true,
      root: this.root,
    };
  }

  search(state: TState, limits: SearchLimits): SearchResult<TState, TMove, TTeam> {
    return this.runSearch(state, limits, null);
  }

  searchWithDiagnostics(state: TState, limits: SearchLimits) {
    return this.runSearch(state, limits, createSearchDiagnostics());
  }

  private runSearch(
    state: TState,
    limits: SearchLimits,
    diagnostics: SearchDiagnostics | null,
  ): SearchResult<TState, TMove, TTeam> {
    const validatedLimits = validateLimits(limits);
    const rootInfo = this.ensureRoot(state);
    const root = rootInfo.root;

    if(diagnostics) {
      diagnostics.rootReused = rootInfo.reused;
      diagnostics.createdNodes += rootInfo.reused ? 0 : 1;
    }

    if(root.isTerminal) {
      throw new Error('Cannot search a terminal state.');
    }

    const startTime = this.now();
    const endTime = validatedLimits.maxTimeMs > 0
      ? startTime + validatedLimits.maxTimeMs
      : Number.POSITIVE_INFINITY;

    let iterations = 0;

    do {
      this.executeRound(root, diagnostics);
      iterations += 1;
    } while(
      (validatedLimits.maxIterations === 0 || iterations < validatedLimits.maxIterations)
      && this.now() < endTime
    );

    const maxChild = this.getMaxChild(root);
    const robustChild = this.getRobustChild(root);
    const secureChild = this.getSecureChild(root);

    if(diagnostics) {
      finalizeSearchDiagnostics(root, diagnostics);
    }

    const result: SearchResult<TState, TMove, TTeam> = {
      bestChild: this.getFinalChild(root),
      bestMove: this.getBestMove(root),
      elapsedMs: this.now() - startTime,
      finalActionStrategy: this.finalActionStrategy,
      iterations,
      maxChild,
      root,
      robustChild,
      secureChild,
    };

    if(diagnostics) {
      result.diagnostics = diagnostics;
    }

    return result;
  }

  executeRound(
    root: SearchNode<TState, TMove, TTeam> | null = this.root,
    diagnostics: SearchDiagnostics | null = null,
  ) {
    if(!root) {
      throw new Error('Cannot execute a round without a root node.');
    }

    const selection = this.select(root, diagnostics);
    const rewards = this.simulate(selection.node, diagnostics);
    this.backpropagate(selection.node, rewards);
  }

  getMaxChild(node: SearchNode<TState, TMove, TTeam> | null = this.root) {
    return this.getBestChild(node, 0);
  }

  getRobustChild(node: SearchNode<TState, TMove, TTeam> | null = this.root) {
    if(!node || node.children.size === 0) {
      return null;
    }

    let bestChild: SearchNode<TState, TMove, TTeam> | null = null;
    let bestVisits = Number.NEGATIVE_INFINITY;
    let bestReward = Number.NEGATIVE_INFINITY;

    for(const child of node.children.values()) {
      if(
        child.visits > bestVisits
        || (child.visits === bestVisits && child.averageReward > bestReward)
      ) {
        bestVisits = child.visits;
        bestReward = child.averageReward;
        bestChild = child;
      }
    }

    return bestChild;
  }

  getSecureChild(
    node: SearchNode<TState, TMove, TTeam> | null = this.root,
    explorationBias = this.explorationBias,
  ) {
    if(!node || node.children.size === 0) {
      return null;
    }

    let bestChild: SearchNode<TState, TMove, TTeam> | null = null;
    let bestBound = Number.NEGATIVE_INFINITY;

    for(const child of node.children.values()) {
      const bound = child.lowerConfidenceBound(explorationBias);
      if(bound > bestBound) {
        bestBound = bound;
        bestChild = child;
      }
    }

    return bestChild;
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

  getFinalChild(
    node: SearchNode<TState, TMove, TTeam> | null = this.root,
    strategy = this.finalActionStrategy,
  ) {
    switch(strategy) {
      case 'maxChild':
        return this.getMaxChild(node);
      case 'robustChild':
        return this.getRobustChild(node);
      case 'maxRobustChild': {
        const robustChild = this.getRobustChild(node);
        const maxChild = this.getMaxChild(node);

        if(!robustChild || !maxChild) {
          return robustChild ?? maxChild;
        }

        return robustChild.visits === maxChild.visits
          ? maxChild
          : robustChild;
      }
      case 'secureChild':
        return this.getSecureChild(node);
    }
  }

  getBestMove(node: SearchNode<TState, TMove, TTeam> | null = this.root) {
    return this.getFinalChild(node)?.move ?? null;
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

  private select(
    node: SearchNode<TState, TMove, TTeam>,
    diagnostics: SearchDiagnostics | null,
  ) {
    let currentNode = node;
    let depth = 0;

    while(!currentNode.isTerminal) {
      if(!currentNode.isFullyExpanded) {
        const expandedNode = this.expand(currentNode, diagnostics);
        const nextDepth = depth + 1;

        if(diagnostics) {
          diagnostics.selectDepthTotal += nextDepth;
          if(nextDepth > diagnostics.maxSelectDepth) {
            diagnostics.maxSelectDepth = nextDepth;
          }
        }

        return {
          depth: nextDepth,
          node: expandedNode,
        };
      }

      const bestChild = this.getBestChild(currentNode);
      if(!bestChild) {
        throw new Error('Fully-expanded node has no children.');
      }

      currentNode = bestChild;
      depth += 1;
    }

    if(diagnostics) {
      diagnostics.selectDepthTotal += depth;
      if(depth > diagnostics.maxSelectDepth) {
        diagnostics.maxSelectDepth = depth;
      }
    }

    return {
      depth,
      node: currentNode,
    };
  }

  private expand(
    node: SearchNode<TState, TMove, TTeam>,
    diagnostics: SearchDiagnostics | null,
  ) {
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

    if(diagnostics) {
      diagnostics.createdNodes += 1;
      diagnostics.expandedNodes += 1;
    }

    return childNode;
  }

  private simulate(
    node: SearchNode<TState, TMove, TTeam>,
    diagnostics: SearchDiagnostics | null,
  ) {
    if(node.isTerminal) {
      if(!node.parent) {
        throw new Error('Cannot simulate from a terminal root node.');
      }

      if(diagnostics) {
        diagnostics.terminalSimulationCount += 1;
      }

      return rewardEntries(node.state.getReward(node.parent.team), node.parent.team);
    }

    let state = node.state;
    let terminalTeam = node.parent ? node.parent.team : node.team;
    let rolloutDepth = 0;

    while(!state.isTerminal()) {
      const suggestion = state.suggestRollout();
      terminalTeam = state.getCurrentTeam();

      if(suggestion) {
        state = suggestion.nextState;
        rolloutDepth += 1;
        continue;
      }

      const rolloutMove = state.selectRolloutMove(this.random);
      if(rolloutMove !== null) {
        state = state.makeMove(rolloutMove);
        rolloutDepth += 1;
        continue;
      }

      const legalMoves = state.getLegalMoves();
      if(legalMoves.length === 0) {
        throw new Error('Non-terminal state has no legal moves.');
      }

      const move = legalMoves[Math.floor(this.random() * legalMoves.length)];
      if(move === undefined) {
        throw new Error('Failed to choose a legal move during rollout.');
      }
      state = state.makeMove(move);
      rolloutDepth += 1;
    }

    if(diagnostics) {
      diagnostics.rolloutSimulationCount += 1;
      diagnostics.rolloutDepthTotal += rolloutDepth;
      if(rolloutDepth > diagnostics.maxRolloutDepth) {
        diagnostics.maxRolloutDepth = rolloutDepth;
      }
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
