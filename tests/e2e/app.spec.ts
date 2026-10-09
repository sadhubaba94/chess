import { expect, test, type BrowserContext, type Page } from '@playwright/test';

interface StartOptions {
  mode?: 'Vs computer' | 'Two players';
  color?: 'White' | 'Black' | 'Random';
  difficulty?: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  minutes?: 'Untimed' | '1' | '3' | '5' | '10' | '15';
}

async function chooseSetup(page: Page, opts: StartOptions): Promise<void> {
  const pick = async (legend: string, label: string) => {
    await page.locator('fieldset', { hasText: legend }).locator('label', { hasText: new RegExp(`^${label}$`) }).click();
  };
  if (opts.mode) await pick('Game mode', opts.mode);
  if (opts.color) await pick('You play', opts.color);
  if (opts.difficulty) await pick('Computer difficulty', opts.difficulty);
  if (opts.minutes) await pick('Time control', opts.minutes);
}

/** Starts a game from the landing page and returns the newly opened tab. */
async function startGame(page: Page, context: BrowserContext, opts: StartOptions = {}): Promise<Page> {
  await page.goto('/');
  await chooseSetup(page, opts);
  const [game] = await Promise.all([context.waitForEvent('page'), page.getByTestId('start-game').click()]);
  await game.waitForLoadState();
  await expect(game.getByTestId('board')).toBeVisible();
  return game;
}

async function move(page: Page, from: string, to: string): Promise<void> {
  await page.locator(`[data-square="${from}"]`).click();
  await page.locator(`[data-square="${to}"]`).click();
}

const moveButtons = (page: Page) => page.locator('[data-testid="move-list"] button');

test('landing page offers the main actions, rules and settings', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Play chess in your browser' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Play against computer/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Play with a friend/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Resume saved game/ })).toBeVisible();
  await page.getByRole('button', { name: 'Rules' }).click();
  await expect(page.getByRole('heading', { name: 'Rules guide' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'Rules guide' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
});

test('two-player game opens in a new tab and ends in checkmate', async ({ page, context }) => {
  const game = await startGame(page, context, { mode: 'Two players' });
  await expect(game).toHaveURL(/\/game\/[A-Za-z0-9-]+$/);
  await move(game, 'f2', 'f3');
  await move(game, 'e7', 'e5');
  await move(game, 'g2', 'g4');
  await move(game, 'd8', 'h4');
  await expect(game.getByRole('heading', { name: 'Black wins' })).toBeVisible();
  await expect(game.getByTestId('result-reason')).toHaveText('By checkmate.');
  await expect(moveButtons(game)).toHaveCount(4);
  await expect(game.locator('[data-square="e1"]')).toHaveAttribute('aria-label', 'e1, white king, in check');
  await game.getByRole('button', { name: 'Review game' }).click();
  await expect(game.getByTestId('status')).toContainText('Black wins');
});

test('blocked popup shows a manual link and the game is still saved', async ({ page, context }) => {
  await context.addInitScript(() => {
    window.open = () => null;
  });
  await page.goto('/');
  await chooseSetup(page, { mode: 'Two players' });
  await page.getByTestId('start-game').click();
  const fallback = page.getByTestId('popup-fallback');
  await expect(fallback).toBeVisible();
  await expect(fallback.getByRole('link', { name: 'Open game in new tab' })).toHaveAttribute('href', /\/game\/[A-Za-z0-9-]+$/);
  await fallback.getByRole('button', { name: 'Open in this tab' }).click();
  await expect(page.getByTestId('board')).toBeVisible();
});

test('computer replies at every difficulty level', async ({ page, context }) => {
  for (const difficulty of ['Easy', 'Medium', 'Hard', 'Expert'] as const) {
    const game = await startGame(page, context, { mode: 'Vs computer', color: 'White', difficulty });
    await move(game, 'e2', 'e4');
    if (difficulty === 'Expert') await expect(game.getByText('Thinking')).toBeVisible();
    await expect(moveButtons(game)).toHaveCount(2, { timeout: 15_000 });
    await expect(game.getByText('Thinking')).not.toBeVisible();
    await game.close();
  }
});

test('playing Black: the computer moves first and the board is flipped', async ({ page, context }) => {
  const game = await startGame(page, context, { mode: 'Vs computer', color: 'Black', difficulty: 'Easy' });
  await expect(game.getByTestId('board')).toHaveAttribute('data-orientation', 'b');
  await expect(moveButtons(game)).toHaveCount(1, { timeout: 15_000 });
  await expect(game.getByTestId('status')).toHaveText('Black to move');
});

test('restarting while the engine is thinking cancels the stale search', async ({ page, context }) => {
  const game = await startGame(page, context, { mode: 'Vs computer', color: 'White', difficulty: 'Expert' });
  await move(game, 'e2', 'e4');
  await expect(game.getByText('Thinking')).toBeVisible();
  await game.getByRole('button', { name: 'Restart' }).click();
  await game.getByRole('dialog').getByRole('button', { name: 'Restart' }).click();
  await expect(game.getByText('No moves yet. White moves first.')).toBeVisible();
  await game.waitForTimeout(4500);
  await expect(moveButtons(game)).toHaveCount(0);
  await move(game, 'd2', 'd4');
  await expect(moveButtons(game)).toHaveCount(2, { timeout: 15_000 });
  await expect(moveButtons(game).first()).toHaveText('d4');
});

test('games autosave, resume after reload and stay independent', async ({ page, context }) => {
  const first = await startGame(page, context, { mode: 'Two players' });
  await move(first, 'e2', 'e4');
  const second = await startGame(page, context, { mode: 'Two players' });
  await move(second, 'd2', 'd4');
  await move(second, 'd7', 'd5');
  expect(first.url()).not.toBe(second.url());
  await first.reload();
  await expect(moveButtons(first)).toHaveCount(1);
  await expect(moveButtons(first).first()).toHaveText('e4');
  await second.reload();
  await expect(moveButtons(second)).toHaveCount(2);
  await page.reload();
  await expect(page.getByTestId('saved-list').locator('li')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /Resume saved game/ })).toContainText('2 saved games');
});

test('review, undo and flip leave the live game consistent', async ({ page, context }) => {
  const game = await startGame(page, context, { mode: 'Two players' });
  await move(game, 'e2', 'e4');
  await move(game, 'e7', 'e5');
  await move(game, 'g1', 'f3');
  await moveButtons(game).first().click();
  await expect(game.getByTestId('back-to-live')).toBeVisible();
  await expect(game.locator('[data-square="f3"]')).toHaveAttribute('aria-label', 'f3, empty');
  await expect(game.getByTestId('fen-output')).toHaveValue('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  await game.getByTestId('back-to-live').click();
  await expect(game.locator('[data-square="f3"]')).toHaveAttribute('aria-label', 'f3, white knight');
  await game.getByRole('button', { name: 'Undo' }).click();
  await expect(moveButtons(game)).toHaveCount(2);
  await game.getByRole('button', { name: 'Flip board' }).click();
  await expect(game.getByTestId('board')).toHaveAttribute('data-orientation', 'b');
});

test('resignation and draw agreement require explicit confirmation', async ({ page, context }) => {
  const game = await startGame(page, context, { mode: 'Two players' });
  await game.getByRole('button', { name: 'Resign (White)' }).click();
  await game.getByRole('button', { name: 'Cancel' }).click();
  await expect(game.getByTestId('status')).toHaveText('White to move');
  await game.getByRole('button', { name: 'Resign (White)' }).click();
  await game.getByRole('dialog').getByRole('button', { name: 'Resign' }).click();
  await expect(game.getByTestId('result-reason')).toHaveText('White resigned.');

  const second = await startGame(page, context, { mode: 'Two players' });
  await second.getByRole('button', { name: 'Offer draw (White)' }).click();
  await second.getByRole('button', { name: 'Black accepts' }).click();
  await expect(second.getByRole('heading', { name: 'Draw' })).toBeVisible();
  await expect(second.getByTestId('result-reason')).toHaveText('By agreement.');
});

test('threefold repetition can be claimed', async ({ page, context }) => {
  const game = await startGame(page, context, { mode: 'Two players' });
  for (let i = 0; i < 2; i++) {
    await move(game, 'g1', 'f3');
    await move(game, 'g8', 'f6');
    await move(game, 'f3', 'g1');
    await move(game, 'f6', 'g8');
  }
  await game.getByTestId('claim-draw').click();
  await expect(game.getByTestId('result-reason')).toHaveText('By threefold repetition (claimed).');
});

test('PGN import validates input and restores the full game; PGN export downloads', async ({ page, context }) => {
  await page.goto('/');
  await chooseSetup(page, { mode: 'Two players' });
  await page.getByTestId('import-text').fill('1. e4 e5 2. Ke3 *');
  await page.getByTestId('import-start').click();
  await expect(page.getByTestId('import-error')).toContainText('Move 2. Ke3 is not legal');
  await page.getByTestId('import-text').fill('[Event "Test"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *');
  const [game] = await Promise.all([context.waitForEvent('page'), page.getByTestId('import-start').click()]);
  await expect(moveButtons(game)).toHaveCount(6);
  await expect(game.getByTestId('fen-output')).toHaveValue('r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4');
  const [download] = await Promise.all([game.waitForEvent('download'), game.getByTestId('download-pgn').click()]);
  expect(download.suggestedFilename()).toMatch(/\.pgn$/);
});

test('FEN import and underpromotion through the promotion dialog', async ({ page, context }) => {
  await page.goto('/');
  await chooseSetup(page, { mode: 'Two players' });
  await page.getByTestId('import-text').fill('8/P7/8/8/8/8/8/k6K w - - 0 1');
  const [game] = await Promise.all([context.waitForEvent('page'), page.getByTestId('import-start').click()]);
  await move(game, 'a7', 'a8');
  await expect(game.getByRole('dialog', { name: 'Choose a piece for promotion' })).toBeVisible();
  await game.getByTestId('promote-n').click();
  await expect(moveButtons(game).first()).toHaveText('a8=N');
  await expect(game.locator('[data-square="a8"]')).toHaveAttribute('aria-label', 'a8, white knight');
});

test('keyboard: arrow keys and Enter make a move', async ({ page, context }) => {
  const game = await startGame(page, context, { mode: 'Two players' });
  const e2 = game.locator('[data-square="e2"]');
  await e2.focus();
  await game.keyboard.press('Enter');
  await expect(e2).toHaveAttribute('aria-label', 'e2, white pawn, selected');
  await game.keyboard.press('ArrowUp');
  await game.keyboard.press('ArrowUp');
  await expect(game.locator('[data-square="e4"]')).toBeFocused();
  await game.keyboard.press('Enter');
  await expect(moveButtons(game).first()).toHaveText('e4');
});

test('mouse drag and drop moves a piece', async ({ page, context }) => {
  const game = await startGame(page, context, { mode: 'Two players' });
  const from = await game.locator('[data-square="g1"]').boundingBox();
  const to = await game.locator('[data-square="f3"]').boundingBox();
  if (!from || !to) throw new Error('squares not rendered');
  await game.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await game.mouse.down();
  await game.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 - 10, { steps: 3 });
  await game.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await game.mouse.up();
  await expect(moveButtons(game).first()).toHaveText('Nf3');
});

test('timed game runs only the active clock', async ({ page, context }) => {
  const game = await startGame(page, context, { mode: 'Two players', minutes: '1' });
  await expect(game.getByTestId('clock-w')).toHaveText('1:00');
  await move(game, 'e2', 'e4');
  await game.waitForTimeout(1600);
  await expect(game.getByTestId('clock-w')).toHaveText('1:00');
  await expect(game.getByTestId('clock-b')).toHaveText(/^0:5\d$/);
  await expect(game.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('@mobile layout has no horizontal scrolling and supports taps', async ({ page, context }) => {
  await page.goto('/');
  const overflowHome = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflowHome).toBeLessThanOrEqual(0);
  const game = await startGame(page, context, { mode: 'Two players', minutes: '5' });
  const overflowGame = await game.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflowGame).toBeLessThanOrEqual(0);
  const board = await game.getByTestId('board').boundingBox();
  const viewport = game.viewportSize();
  expect(board && viewport && board.width <= viewport.width).toBeTruthy();
  await game.locator('[data-square="e2"]').tap();
  await game.locator('[data-square="e4"]').tap();
  await expect(moveButtons(game).first()).toHaveText('e4');
});
