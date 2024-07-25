const { GameState } = require('./mcts');

class TicTacToeState extends GameState {
    constructor(board=null, team=true) {
        super();
        this.board = board || Array(9).fill(null);
        this.team = team;
    }

    getCurrentTeam() { return this.team ? "X" : "O"; }
    getLegalMoves() {
		const moves = [];
		for(let i=0; i<this.board.length; i++) {
			if(this.board[i]===null) {
				moves.push(i.toString());
			}
		}
		return moves;
    }
    makeMove(move) {
        const board = [...this.board];
        board[parseInt(move)] = this.team;
        return new TicTacToeState(board, !this.team);
    }
    isTerminal() { return !this._hasOpenSpaces() || this._hasWinner(); }
    getReward(team) { return this._hasWinner() ? 1 : 0; }
	toString() {
		let str = (this.team ? "X" : "O") + " : ";
		for(let i=0; i<this.board.length; i++) {
			str += (this.board[i]===null ? "_" : (this.board[i] ? "X" : "O"));
			if(i===2 || i===5) str += "/";
		}
		return str;
	}

    _hasOpenSpaces() { return this.board.some(x => x===null); }
    _hasWinner() {
		const lines = [
			[0,1,2], [3,4,5], [6,7,8], // rows
			[0,3,6], [1,4,7], [2,5,8], // columns
			[0,4,8], [2,4,6], // diagonals
		];
		for(let [a,b,c] of lines) {
			if(this.board[a]!==null && this.board[a]===this.board[b] && this.board[a]===this.board[c]) {
				return true;
			}
		}
		return false;
    }
}

module.exports = TicTacToeState;
