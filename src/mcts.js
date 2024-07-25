// mcts.js

/**
 * The GameState interface must be implemented per game.
 */
class GameState {
	/**
	 * The identifier of the current team.
	 * Must be a valid JS dict key (string).
	 */
	getCurrentTeam() { throw "GameState must implement getCurrentTeam."; }
	/**
	 * Array of legal moves from the current state.
	 * Each move must be a valid JS dict key (string).
	 */
	getLegalMoves() { throw "GameState must implement getLegalMoves."; }
	/**
	 * A new GameState object, the result of applying the given move to the current state.
	 * Do NOT modify the current state.
	 */
	makeMove(move) { throw "GameState must implement makeMove."; }
	/** Whether the game is over. */
	isTerminal() { throw "GameState must implement isTerminal."; }
	/**
	 * The reward earned by the team that played the game-ending move (i.e. the team from the previous state).
	 * Typically 1 for win, -1 for loss, 0 for draw.
	 * Alternatively, returns a dict of teams/rewards: {team1:reward1, team2:reward2, ...}
	 * For convenience, the terminal team is provided as an argument.
	 * Note: This method is only called on terminal states.
	 */
	getReward(team) { throw "GameState must implement getReward."; }
	/**
	 * Optional. Implement this method to serve as a rollout/playout policy.
	 * If not implemented, MCTS will choose a random legal move (random rollouts).
	 * Note: This method is only called on non-terminal states.
	 */
	suggestMove() { return null; }
	/** Optional utility method, used in Node.getStats. */
	toString() { return JSON.stringify(this); }
}

class MCTS {
	constructor(explorationBias=1.414) {
		this.explorationBias = explorationBias;
		this.rootNode = null;
	}

	search(state, maxIterations=null, maxTime=null) {
		let i = 0;
		const endTime = Date.now() + (1000*maxTime);

		this.rootNode = new Node(state);

		while(true) {
			this.executeRound(this.rootNode);
			if(maxIterations && ++i>=maxIterations) break;
			if(maxTime && Date.now()>=endTime) break;
		}

		return this.rootNode.findBestChild(0).move;
	}

	executeRound(node) {
		// 1-2. Selection/Expansion
		const childNode = this.select(node);
		// 3. Simulation
		const rewards = this.simulate(childNode);
		// 4. Backpropagation
		this.backpropagate(childNode, rewards);
	}

	/** 1. Traverse the tree for the best descendant of the given node. */
	select(node) {
		while(!node.isTerminal) {
			if(!node.isFullyExpanded) {
				return this.expand(node);
			}
			node = node.findBestChild(this.explorationBias);
		}
		return node;
	}

	/** 2. Add a new child to the given node. */
	expand(node) {
		const move = node.remainingMoves.pop();
		if(node.remainingMoves.length === 0) {
			node.isFullyExpanded = true;
		}
		const childState = node.state.makeMove(move);
		const childNode = new Node(childState, node, move);
		node.children[move] = childNode;
		return childNode;
	}

	/** 3. Simulate a game from the given node. */
	simulate(node) {
		let state = node.state;
		let terminalTeam = node.parent.team;
		while(!state.isTerminal()) {
			let move = state.suggestMove();
			if(!move) {
				// If no rollout policy is provided, choose a random legal move.
				const legalMoves = state.getLegalMoves();
				move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
			}
			terminalTeam = state.getCurrentTeam();
			state = state.makeMove(move);
		}

		let rewards = state.getReward(terminalTeam);
		if(typeof rewards === 'number') {
			// Convert number reward to dict format.
			rewards = {[terminalTeam]: rewards};
		}
		return rewards;
	}

	/** 4. Propagate the rewards back up the tree. */
	backpropagate(node, rewards) {
		while(node) {
			node.visit(rewards);
			node = node.parent;
		}
	}
}

class Node {
	constructor(state, parent=null, move=null) {
		this.state = state;
		this.parent = parent;
		this.move = move;

		this.children = {};
		this.visits = 0;
		this.rewards = {};
		this.isFullyExpanded = this.isTerminal = this.state.isTerminal();

		if(!this.isFullyExpanded) {
			// Get legal moves and shuffle them.
			this.remainingMoves = this.state.getLegalMoves();
			for(let i = this.remainingMoves.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[this.remainingMoves[i], this.remainingMoves[j]] = [this.remainingMoves[j], this.remainingMoves[i]];
			}
		} else {
			this.remainingMoves = [];
		}

		this.team = this.state.getCurrentTeam();
		if(this.parent) {
			this.rewards[this.parent.team] = 0;
		}
	}

	visit(rewards) {
		this.visits++;
		for(let team in rewards) {
			if(!(team in this.rewards)) {
				this.rewards[team] = 0;
			}
			this.rewards[team] += rewards[team];
		}
	}

	findBestChild(explorationBias) {
		let bestChild = null;
		let bestScore = -Infinity;

		for(let move in this.children) {
			const child = this.children[move];
			const score = this.calcScore(child, explorationBias);
			if(score > bestScore) {
				bestChild = child;
				bestScore = score;
			}
		}

		return bestChild;
	}

	/**
	 * avg = (my rewards - others' rewards) / visits
	 */
	avgReward() {
		const totalRewards = Object.values(this.rewards).reduce((a,b) => a+b, 0);
		const rewardDiff = 2 * (this.rewards[this.parent.team] || 0) - totalRewards;
		return rewardDiff / this.visits;
	}

	/**
	 * UCTj = Xj + C * sqrt(ln(n)/nj)
	 *	Xj = child's avg reward
	 *	C = exploration bias
	 *	n = parent visits
	 *	nj = child visits
	 */
	calcScore(child, explorationBias) {
		return child.avgReward() + (explorationBias * Math.sqrt(Math.log(this.visits) / child.visits));
	}

	getStats(depth=0) {
		return {
			move: this.move,
			state: (this.state.toString!==Object.prototype.toString ? this.state.toString() : this.state),
			visits: this.visits,
			rewards: this.rewards,
			children: (depth > 0
				? Object.keys(this.children).map(move => this.children[move].getStats(depth-1)).sort((a,b) => b.visits-a.visits)
				: "[max depth reached]"
			),
		};
	}
}

module.exports = {MCTS, GameState};
