// multimcts.d.ts
declare module 'multimcts' {
  export class GameState {
    getCurrentTeam(): string;
    getLegalMoves(): string[];
    makeMove(move: string): GameState;
    isTerminal(): boolean;
    getReward(team: string): number | { [team: string]: number };
    suggestMove(): string | null;
    toString(): string;
  }

  export class MCTS {
    constructor(explorationBias?: number);
    search(state: GameState, maxIterations?: number, maxTime?: number): string;
    executeRound(node: Node): void;
    select(node: Node): Node;
    expand(node: Node): Node;
    simulate(node: Node): { [team: string]: number };
    backpropagate(node: Node, rewards: { [team: string]: number }): void;
  }

  export class Node {
    constructor(state: GameState, parent?: Node | null, move?: string | null);
    visit(rewards: { [team: string]: number }): void;
    findBestChild(explorationBias: number): Node;
    avgReward(): number;
    calcScore(child: Node, explorationBias: number): number;
    getStats(depth?: number): any;
  }
}
