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
  maxRetainedNodes?: number;
  maxTimeMs?: number;
}

export interface SearchMetrics {
  elapsedMs: number;
  iterations: number;
}

export type TeamValueStrategyName = 'self' | 'margin' | 'vsBestOpponent';
export type TeamValueEvaluator<TTeam> = (
  team: TTeam,
  rewards: ReadonlyMap<TTeam, number>,
) => number;

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
  averageValue: number;
  children: SearchNodeStats<TMove, TTeam>[] | '[max depth reached]';
  isFullyExpanded: boolean;
  isTerminal: boolean;
  move: TMove | null;
  utilitySums: Array<[TTeam, number]>;
  state: string;
  team: TTeam;
  visits: number;
}

export interface SearchNodeView<TState, TMove, TTeam> {
  readonly averageValue: number;
  readonly children: ReadonlyMap<TMove, SearchNodeView<TState, TMove, TTeam>>;
  readonly isFullyExpanded: boolean;
  readonly isTerminal: boolean;
  readonly move: TMove | null;
  readonly parent: SearchNodeView<TState, TMove, TTeam> | null;
  readonly state: TState;
  readonly team: TTeam;
  readonly utilitySums: ReadonlyMap<TTeam, number>;
  readonly visits: number;
}

export interface SearchResult<TState, TMove, TTeam> extends SearchMetrics {
  bestChild: SearchNodeView<TState, TMove, TTeam> | null;
  bestMove: TMove | null;
  diagnostics?: SearchDiagnostics;
  root: SearchNodeView<TState, TMove, TTeam>;
}

export interface MCTSOptions<TState, TMove, TTeam> {
  explorationConstant?: number;
  /** @deprecated Use explorationConstant instead. */
  explorationBias?: number;
  evaluateTeamValue?: TeamValueEvaluator<TTeam>;
  finalActionStrategy?: FinalActionStrategy;
  now?: () => number;
  random?: () => number;
  stateKey?: (state: TState) => string;
  teamValueStrategy?: TeamValueStrategyName;
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

  suggestRollout(_random: () => number): RolloutSuggestion<TMove, TState> | null {
    return null;
  }

  sampleLegalMove(random: () => number): TMove {
    const legalMoves = this.getLegalMoves();
    if(legalMoves.length === 0) {
      throw new Error('Non-terminal state has no legal moves.');
    }

    const move = legalMoves[Math.floor(random() * legalMoves.length)];
    if(move === undefined) {
      throw new Error('Failed to choose a legal move.');
    }

    return move;
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
  const { maxIterations, maxRetainedNodes, maxTimeMs } = limits;

  if(maxIterations === undefined && maxRetainedNodes === undefined && maxTimeMs === undefined) {
    throw new Error('At least one of maxIterations, maxRetainedNodes, or maxTimeMs is required.');
  }

  if(maxIterations !== undefined) {
    assertPositiveInteger(maxIterations, 'maxIterations');
  }

  if(maxRetainedNodes !== undefined) {
    assertPositiveInteger(maxRetainedNodes, 'maxRetainedNodes');
  }

  if(maxTimeMs !== undefined) {
    assertPositiveNumber(maxTimeMs, 'maxTimeMs');
  }

  return {
    maxIterations: maxIterations ?? 0,
    maxRetainedNodes: maxRetainedNodes ?? 0,
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

const getRewardForTeam = <TTeam>(team: TTeam, rewards: ReadonlyMap<TTeam, number>) => (
  rewards.get(team) ?? 0
);

const selfTeamValue = <TTeam>(team: TTeam, rewards: ReadonlyMap<TTeam, number>) => (
  getRewardForTeam(team, rewards)
);

const marginTeamValue = <TTeam>(team: TTeam, rewards: ReadonlyMap<TTeam, number>) => {
  let own = 0;
  let otherTotal = 0;

  for(const [candidateTeam, reward] of rewards.entries()) {
    if(candidateTeam === team) {
      own += reward;
    } else {
      otherTotal += reward;
    }
  }

  return own - otherTotal;
};

const vsBestOpponentTeamValue = <TTeam>(team: TTeam, rewards: ReadonlyMap<TTeam, number>) => {
  const own = getRewardForTeam(team, rewards);
  let bestOpponent = Number.NEGATIVE_INFINITY;

  for(const [candidateTeam, reward] of rewards.entries()) {
    if(candidateTeam !== team && reward > bestOpponent) {
      bestOpponent = reward;
    }
  }

  return own - (bestOpponent === Number.NEGATIVE_INFINITY ? 0 : bestOpponent);
};

export const teamValueStrategies = {
  margin: marginTeamValue,
  self: selfTeamValue,
  vsBestOpponent: vsBestOpponentTeamValue,
} as const;

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

const asTreeNode = <TState, TMove, TTeam>(
  node: SearchNodeView<TState, TMove, TTeam> | null,
) => node as TreeNode<TState, TMove, TTeam> | null;

const resolveAliasedNumberOption = (
  preferredValue: number | undefined,
  deprecatedValue: number | undefined,
  preferredLabel: string,
  deprecatedLabel: string,
) => {
  if(preferredValue !== undefined && deprecatedValue !== undefined && preferredValue !== deprecatedValue) {
    throw new Error(`${preferredLabel} and ${deprecatedLabel} cannot disagree when both are provided.`);
  }

  return preferredValue ?? deprecatedValue;
};

class TreeNode<TState, TMove, TTeam> implements SearchNodeView<TState, TMove, TTeam> {
  private averageValueSum: number;
  private readonly childNodes: Map<TMove, TreeNode<TState, TMove, TTeam>>;
  private fullyExpanded: boolean;
  readonly isTerminal: boolean;
  readonly move: TMove | null;
  private parentNode: TreeNode<TState, TMove, TTeam> | null;
  private readonly remainingMoves: TMove[];
  private subtreeNodeCount: number;
  private readonly utilitySumsMap: Map<TTeam, number>;
  readonly state: TState;
  readonly team: TTeam;
  private inverseSqrtVisits: number;
  private sqrtLogVisits: number;
  private visitCount: number;
  private meanValue: number;

  constructor(
    state: TState & {
      getCurrentTeam(): TTeam;
      getLegalMoves(): readonly TMove[];
      isTerminal(): boolean;
    },
    random: () => number,
    parent: TreeNode<TState, TMove, TTeam> | null = null,
    move: TMove | null = null,
  ) {
    this.state = state;
    this.parentNode = parent;
    this.move = move;
    this.childNodes = new Map();
    this.visitCount = 0;
    this.utilitySumsMap = new Map();
    this.averageValueSum = 0;
    this.meanValue = 0;
    this.sqrtLogVisits = 0;
    this.inverseSqrtVisits = 0;
    this.subtreeNodeCount = 1;
    this.isTerminal = state.isTerminal();
    this.fullyExpanded = this.isTerminal;

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
  }

  get children(): ReadonlyMap<TMove, SearchNodeView<TState, TMove, TTeam>> {
    return this.childNodes;
  }

  get isFullyExpanded() {
    return this.fullyExpanded;
  }

  get parent(): SearchNodeView<TState, TMove, TTeam> | null {
    return this.parentNode;
  }

  get utilitySums(): ReadonlyMap<TTeam, number> {
    return this.utilitySumsMap;
  }

  get averageValue() {
    return this.meanValue;
  }

  get visits() {
    return this.visitCount;
  }

  visit(
    rewardPairs: ReadonlyArray<readonly [TTeam, number]>,
    parentTeamValue: number | null,
  ) {
    this.visitCount += 1;
    this.sqrtLogVisits = Math.sqrt(Math.log(this.visitCount));
    this.inverseSqrtVisits = 1 / Math.sqrt(this.visitCount);

    for(const [team, reward] of rewardPairs) {
      this.utilitySumsMap.set(team, (this.utilitySumsMap.get(team) ?? 0) + reward);
    }

    if(parentTeamValue !== null) {
      this.averageValueSum += parentTeamValue;
      this.meanValue = this.averageValueSum / this.visitCount;
    }
  }

  detachFromParent() {
    this.parentNode = null;
  }

  getParentNode() {
    return this.parentNode;
  }

  attachChild(move: TMove, child: TreeNode<TState, TMove, TTeam>) {
    this.childNodes.set(move, child);
    this.adjustSubtreeNodeCount(child.subtreeNodeCount);
  }

  takeUnexpandedMove() {
    const move = this.remainingMoves.pop();
    if(move === undefined) {
      return null;
    }

    if(this.remainingMoves.length === 0) {
      this.fullyExpanded = true;
    }

    return move;
  }

  uncertainty(explorationConstant: number) {
    if(!this.parentNode || this.visitCount === 0 || this.parentNode.visitCount === 0) {
      return Number.POSITIVE_INFINITY;
    }

    return explorationConstant * this.parentNode.sqrtLogVisits * this.inverseSqrtVisits;
  }

  calcScore(explorationConstant: number) {
    if(!this.parentNode) {
      return this.meanValue;
    }

    if(this.visitCount === 0 || this.parentNode.visitCount === 0) {
      return Number.POSITIVE_INFINITY;
    }

    return this.meanValue + this.uncertainty(explorationConstant);
  }

  lowerConfidenceBound(explorationConstant: number) {
    if(!this.parentNode) {
      return this.meanValue;
    }

    return this.meanValue - this.uncertainty(explorationConstant);
  }

  selectBestChild(explorationConstant: number) {
    let bestChild: TreeNode<TState, TMove, TTeam> | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for(const child of this.childNodes.values()) {
      let score = Number.POSITIVE_INFINITY;

      if(child.visitCount > 0 && this.visitCount > 0) {
        score = child.meanValue + (explorationConstant * this.sqrtLogVisits * child.inverseSqrtVisits);
      }

      if(score > bestScore) {
        bestScore = score;
        bestChild = child;
      }
    }

    return bestChild;
  }

  selectSecureChild(explorationConstant: number) {
    let bestChild: TreeNode<TState, TMove, TTeam> | null = null;
    let bestBound = Number.NEGATIVE_INFINITY;

    for(const child of this.childNodes.values()) {
      let bound = Number.POSITIVE_INFINITY;

      if(child.visitCount > 0 && this.visitCount > 0) {
        bound = child.meanValue - (explorationConstant * this.sqrtLogVisits * child.inverseSqrtVisits);
      }

      if(bound > bestBound) {
        bestBound = bound;
        bestChild = child;
      }
    }

    return bestChild;
  }

  getStats(depth = 0): SearchNodeStats<TMove, TTeam> {
    const childStats = depth > 0
      ? [...this.childNodes.values()]
        .sort((left, right) => right.visits - left.visits)
        .map((child) => child.getStats(depth - 1))
      : '[max depth reached]';

    return {
      averageValue: this.meanValue,
      children: childStats,
      isFullyExpanded: this.fullyExpanded,
      isTerminal: this.isTerminal,
      move: this.move,
      utilitySums: [...this.utilitySumsMap.entries()],
      state: stateToString(this.state),
      team: this.team,
      visits: this.visitCount,
    };
  }

  getSubtreeNodeCount() {
    return this.subtreeNodeCount;
  }

  private adjustSubtreeNodeCount(delta: number) {
    let currentNode: TreeNode<TState, TMove, TTeam> | null = this;

    while(currentNode) {
      currentNode.subtreeNodeCount += delta;
      currentNode = currentNode.parentNode;
    }
  }
}

const finalizeSearchDiagnostics = <TState, TMove, TTeam>(
  root: TreeNode<TState, TMove, TTeam>,
  diagnostics: SearchDiagnostics,
) => {
  let treeMaxDepth = 0;
  const stack: Array<{ depth: number; node: TreeNode<TState, TMove, TTeam> }> = [
    { depth: 0, node: root },
  ];

  while(stack.length > 0) {
    const current = stack.pop();
    if(!current) {
      continue;
    }

    if(current.depth > treeMaxDepth) {
      treeMaxDepth = current.depth;
    }

    for(const child of current.node.children.values()) {
      stack.push({ depth: current.depth + 1, node: asTreeNode(child)! });
    }
  }

  diagnostics.retainedNodeCount = root.getSubtreeNodeCount();
  diagnostics.treeMaxDepth = treeMaxDepth;
};

export class MCTS<
  TState extends GameState<TMove, TTeam, TState>,
  TMove = string,
  TTeam = string,
> {
  readonly evaluateTeamValue: TeamValueEvaluator<TTeam>;
  readonly explorationConstant: number;
  readonly finalActionStrategy: FinalActionStrategy;
  private currentRetainedNodeCount: number;
  private rootNode: TreeNode<TState, TMove, TTeam> | null;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly stateKey: ((state: TState) => string) | undefined;

  constructor(options: number | MCTSOptions<TState, TMove, TTeam> = {}) {
    const resolvedOptions = typeof options === 'number'
      ? { explorationConstant: options }
      : options;

    const explorationConstant = resolveAliasedNumberOption(
      resolvedOptions.explorationConstant,
      resolvedOptions.explorationBias,
      'explorationConstant',
      'explorationBias',
    ) ?? Math.SQRT2;
    if(!Number.isFinite(explorationConstant) || explorationConstant < 0) {
      throw new Error('explorationConstant must be a non-negative number.');
    }

    this.explorationConstant = explorationConstant;
    this.finalActionStrategy = resolvedOptions.finalActionStrategy ?? 'robustChild';
    this.evaluateTeamValue = resolvedOptions.evaluateTeamValue
      ?? teamValueStrategies[resolvedOptions.teamValueStrategy ?? 'margin'];
    this.random = resolvedOptions.random ?? Math.random;
    this.now = resolvedOptions.now ?? (() => performance.now());
    this.stateKey = resolvedOptions.stateKey;
    this.currentRetainedNodeCount = 0;
    this.rootNode = null;
  }

  get explorationBias() {
    return this.explorationConstant;
  }

  get root(): SearchNodeView<TState, TMove, TTeam> | null {
    return this.rootNode;
  }

  reset() {
    this.currentRetainedNodeCount = 0;
    this.rootNode = null;
  }

  private initializeRoot(state: TState) {
    this.rootNode = new TreeNode(state, this.random);
    this.currentRetainedNodeCount = this.rootNode.getSubtreeNodeCount();
    return this.rootNode;
  }

  private ensureRoot(state: TState) {
    if(!this.rootNode || !this.statesMatch(this.rootNode.state, state)) {
      return {
        reused: false,
        root: this.initializeRoot(state),
      };
    }

    this.currentRetainedNodeCount = this.rootNode.getSubtreeNodeCount();

    return {
      reused: true,
      root: this.rootNode,
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

    while(
      (validatedLimits.maxIterations === 0 || iterations < validatedLimits.maxIterations)
      && this.now() < endTime
      && (
        validatedLimits.maxRetainedNodes === 0
        || this.currentRetainedNodeCount < validatedLimits.maxRetainedNodes
        || root.children.size === 0
      )
    ) {
      this.executeRound(root, diagnostics);
      this.currentRetainedNodeCount = root.getSubtreeNodeCount();
      iterations += 1;
    }

    if(diagnostics) {
      finalizeSearchDiagnostics(root, diagnostics);
    }

    const result: SearchResult<TState, TMove, TTeam> = {
      bestChild: this.getFinalChild(root),
      bestMove: this.getBestMove(root),
      elapsedMs: this.now() - startTime,
      iterations,
      root,
    };

    if(diagnostics) {
      result.diagnostics = diagnostics;
    }

    return result;
  }

  executeRound(
    root: SearchNodeView<TState, TMove, TTeam> | null = this.rootNode,
    diagnostics: SearchDiagnostics | null = null,
  ) {
    const rootNode = asTreeNode(root);
    if(!rootNode) {
      throw new Error('Cannot execute a round without a root node.');
    }

    const selection = this.select(rootNode, diagnostics);
    const rewards = this.simulate(selection.node, diagnostics);
    this.backpropagate(selection.node, rewards);
  }

  getMaxChild(node: SearchNodeView<TState, TMove, TTeam> | null = this.rootNode) {
    return this.getBestChild(node, 0);
  }

  getRobustChild(node: SearchNodeView<TState, TMove, TTeam> | null = this.rootNode) {
    const nodeRef = asTreeNode(node);
    if(!nodeRef || nodeRef.children.size === 0) {
      return null;
    }

    let bestChild: TreeNode<TState, TMove, TTeam> | null = null;
    let bestVisits = Number.NEGATIVE_INFINITY;
    let bestReward = Number.NEGATIVE_INFINITY;

    for(const childView of nodeRef.children.values()) {
      const child = asTreeNode(childView)!;
      if(
        child.visits > bestVisits
        || (child.visits === bestVisits && child.averageValue > bestReward)
      ) {
        bestVisits = child.visits;
        bestReward = child.averageValue;
        bestChild = child;
      }
    }

    return bestChild;
  }

  getSecureChild(
    node: SearchNodeView<TState, TMove, TTeam> | null = this.rootNode,
    explorationConstant = this.explorationConstant,
  ) {
    const nodeRef = asTreeNode(node);
    if(!nodeRef || nodeRef.children.size === 0) {
      return null;
    }

    return nodeRef.selectSecureChild(explorationConstant);
  }

  getBestChild(
    node: SearchNodeView<TState, TMove, TTeam> | null = this.rootNode,
    explorationConstant = this.explorationConstant,
  ) {
    const nodeRef = asTreeNode(node);
    if(!nodeRef || nodeRef.children.size === 0) {
      return null;
    }

    return nodeRef.selectBestChild(explorationConstant);
  }

  getFinalChild(
    node: SearchNodeView<TState, TMove, TTeam> | null = this.rootNode,
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

  getBestMove(node: SearchNodeView<TState, TMove, TTeam> | null = this.rootNode) {
    return this.getFinalChild(node)?.move ?? null;
  }

  advanceToChild(move: TMove, nextState?: TState) {
    if(!this.rootNode) {
      return null;
    }

    const child = asTreeNode(this.rootNode.children.get(move) ?? null);
    if(!child) {
      return null;
    }

    if(nextState && !this.statesMatch(child.state, nextState)) {
      return null;
    }

    child.detachFromParent();
    this.rootNode = child;
    this.currentRetainedNodeCount = child.getSubtreeNodeCount();
    return child;
  }

  private select(
    node: TreeNode<TState, TMove, TTeam>,
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

      const bestChild = currentNode.selectBestChild(this.explorationConstant);
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
    node: TreeNode<TState, TMove, TTeam>,
    diagnostics: SearchDiagnostics | null,
  ) {
    const move = node.takeUnexpandedMove();
    if(move === null) {
      throw new Error('Cannot expand a node with no remaining moves.');
    }

    const childState = node.state.makeMove(move);
    const childNode = new TreeNode(childState, this.random, node, move);
    node.attachChild(move, childNode);

    if(diagnostics) {
      diagnostics.createdNodes += 1;
      diagnostics.expandedNodes += 1;
    }

    return childNode;
  }

  private simulate(
    node: TreeNode<TState, TMove, TTeam>,
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
      const suggestion = state.suggestRollout(this.random);
      terminalTeam = state.getCurrentTeam();

      if(suggestion) {
        state = suggestion.nextState;
        rolloutDepth += 1;
        continue;
      }

      const move = state.sampleLegalMove(this.random);
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
    node: TreeNode<TState, TMove, TTeam>,
    rewards: ReadonlyMap<TTeam, number>,
  ) {
    let currentNode: TreeNode<TState, TMove, TTeam> | null = node;
    const teamValueCache = new Map<TTeam, number>();
    const rewardPairs = [...rewards.entries()];

    while(currentNode) {
      const parentNode = currentNode.getParentNode();
      const parentTeam = parentNode?.team ?? null;
      let parentTeamValue: number | null = null;

      if(parentTeam !== null) {
        if(teamValueCache.has(parentTeam)) {
          parentTeamValue = teamValueCache.get(parentTeam) ?? null;
        } else {
          parentTeamValue = this.evaluateTeamValue(parentTeam, rewards);
          teamValueCache.set(parentTeam, parentTeamValue);
        }
      }

      currentNode.visit(rewardPairs, parentTeamValue);
      currentNode = parentNode;
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
