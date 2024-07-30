const test = require('node:test');
const assert = require('node:assert');
const { MCTS, GameState } = require('../src/mcts');
const TicTacToeState = require('../examples/TicTacToe');


test('GameState interface', async (t) => {
	await t.test('getCurrentTeam', (t) => {
		let state = new TicTacToeState();
		assert.strictEqual('X', state.getCurrentTeam());

		state = state.makeMove('0');
		assert.strictEqual('O', state.getCurrentTeam());
	});

	await t.test('getLegalMoves', (t) => {
		let state = new TicTacToeState();
		assert.deepStrictEqual(['0','1','2','3','4','5','6','7','8'], state.getLegalMoves());

		state = state.makeMove('0');
		assert.deepStrictEqual(['1','2','3','4','5','6','7','8'], state.getLegalMoves());
	});

	await t.test('makeMove', (t) => {
		let state = new TicTacToeState();
		state = state.makeMove(state.getLegalMoves()[0]);
		assert.strictEqual('O : X__/___/___', state.toString());
	});

	await t.test('isTerminal', (t) => {
		assert.strictEqual(false, new TicTacToeState().isTerminal());
		assert.strictEqual(true, new TicTacToeState([true,true,true, null,null,null, null,null,null], false).isTerminal());
	});

	await t.test('getReward', (t) => {
		assert.strictEqual(0, new TicTacToeState([false,true,false, true,true,false, true,false,true]).getReward());
		assert.strictEqual(1, new TicTacToeState([true,true,true, null,null,null, null,null,null]).getReward());
		assert.strictEqual(1, new TicTacToeState([true,null,null, null,true,null, null,null,true]).getReward());
	});
});


test('MCTS search', (t) => {
	const mcts = new MCTS();

	let state = new TicTacToeState([true,true,null, null,null,null, null,null,null], true);
	assert.strictEqual('X : XX_/___/___', state.toString());
	assert.strictEqual(false, state.isTerminal());

	state = state.makeMove(mcts.search(state, 1000));
	assert.strictEqual('O : XXX/___/___', state.toString());
	assert.strictEqual(true, state.isTerminal());

	state = new TicTacToeState([true,true,null, null,null,null, null,null,null], false);
	state = state.makeMove(mcts.search(state, 1000));
	assert.strictEqual('X : XXO/___/___', state.toString());
	assert.strictEqual(false, state.isTerminal());
});
