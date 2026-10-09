import { ChessGame } from './rules/game';
import { FenError } from './rules/position';
import { START_FEN, describeResult, resultToPgn, type GameResult } from './types';

export class PgnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PgnError';
  }
}

export interface ParsedPgn {
  headers: Record<string, string>;
  startFen: string;
  /** Moves in UCI notation, already validated. */
  moves: string[];
  /** Rule-based outcome of the final position, or the PGN result if the game was decided off the board. */
  result: GameResult | null;
}

export interface PgnExportOptions {
  game: ChessGame;
  result: GameResult | null;
  white: string;
  black: string;
  date: Date;
  timeControl: string;
  event?: string;
}

const MAX_PGN_LENGTH = 1_000_000;

function pgnDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

function escapeTag(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function terminationTag(result: GameResult | null): string {
  if (!result) return 'unterminated';
  if (result.termination === 'timeout' || result.termination === 'timeout_insufficient_material') return 'time forfeit';
  return 'normal';
}

export function exportPgn(opts: PgnExportOptions): string {
  const { game, result } = opts;
  const resultToken = resultToPgn(result);
  const tags: [string, string][] = [
    ['Event', opts.event ?? 'Casual game'],
    ['Site', 'Kingside (local browser game)'],
    ['Date', pgnDate(opts.date)],
    ['Round', '-'],
    ['White', opts.white],
    ['Black', opts.black],
    ['Result', resultToken],
  ];
  if (game.startFen !== START_FEN) {
    tags.push(['SetUp', '1'], ['FEN', game.startFen]);
  }
  tags.push(['TimeControl', opts.timeControl], ['Termination', terminationTag(result)]);

  const startFields = game.startFen.split(' ');
  let moveNumber = Number(startFields[5]);
  let color = startFields[1];
  const tokens: string[] = [];
  game.history().forEach((m, i) => {
    if (color === 'w') tokens.push(`${moveNumber}.`);
    else if (i === 0) tokens.push(`${moveNumber}...`);
    tokens.push(m.san);
    if (color === 'b') moveNumber++;
    color = color === 'w' ? 'b' : 'w';
  });
  if (result) tokens.push(`{${describeResult(result).headline} ${describeResult(result).reason}.}`);
  tokens.push(resultToken);

  const lines: string[] = [];
  let line = '';
  for (const t of tokens) {
    if (line && line.length + 1 + t.length > 80) {
      lines.push(line);
      line = t;
    } else {
      line = line ? `${line} ${t}` : t;
    }
  }
  if (line) lines.push(line);
  return `${tags.map(([k, v]) => `[${k} "${escapeTag(v)}"]`).join('\n')}\n\n${lines.join('\n')}\n`;
}

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

/** Parses the first game in a PGN text. Throws PgnError with a user-readable message. */
export function parsePgn(input: string): ParsedPgn {
  if (input.length > MAX_PGN_LENGTH) throw new PgnError('The PGN is too large (limit: 1 MB).');
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.trim()) throw new PgnError('The PGN is empty.');

  const headers: Record<string, string> = {};
  let i = 0;
  const n = text.length;
  const skipWs = () => {
    while (i < n && /\s/.test(text[i]!)) i++;
  };

  // Tag pairs
  for (;;) {
    skipWs();
    if (text[i] === '%') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (text[i] !== '[') break;
    const end = text.indexOf('\n', i);
    const lineEnd = end < 0 ? n : end;
    const tagLine = text.slice(i, lineEnd).trim();
    const m = /^\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]$/.exec(tagLine);
    if (!m) throw new PgnError(`Malformed tag line: ${tagLine.slice(0, 60)}`);
    headers[m[1]!] = m[2]!.replace(/\\(["\\])/g, '$1');
    i = lineEnd;
  }

  // Movetext tokens
  const tokens: string[] = [];
  let resultToken: string | null = null;
  while (i < n) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '{') {
      const close = text.indexOf('}', i);
      if (close < 0) throw new PgnError('A comment "{" is never closed.');
      i = close + 1;
      continue;
    }
    if (ch === ';') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '(') {
      let depth = 0;
      while (i < n) {
        const c = text[i]!;
        if (c === '{') {
          const close = text.indexOf('}', i);
          if (close < 0) throw new PgnError('A comment "{" is never closed.');
          i = close + 1;
          continue;
        }
        if (c === '(') depth++;
        if (c === ')') depth--;
        i++;
        if (depth === 0) break;
      }
      if (depth !== 0) throw new PgnError('A variation "(" is never closed.');
      continue;
    }
    if (ch === ')') throw new PgnError('Unexpected ")" without a matching "(".');
    if (ch === '[') break; // start of a following game
    let j = i;
    while (j < n && !/[\s{};()[\]]/.test(text[j]!)) j++;
    const token = text.slice(i, j);
    i = j;
    if (RESULT_TOKENS.has(token)) {
      resultToken = token;
      break;
    }
    if (/^\$\d+$/.test(token) || /^\d+$/.test(token)) continue;
    const san = token.replace(/^\d+\.+/, '').replace(/^\.+/, '').replace(/[!?]+$/, '');
    if (!san) continue;
    tokens.push(san);
  }

  if (!tokens.length && !Object.keys(headers).length) {
    throw new PgnError('No PGN tags or moves were found.');
  }

  let game: ChessGame;
  const fenTag = headers.FEN;
  try {
    game = new ChessGame(fenTag ?? START_FEN);
  } catch (e) {
    if (e instanceof FenError) throw new PgnError(`The FEN tag is invalid: ${e.message}`);
    throw e;
  }

  for (const token of tokens) {
    const moveNo = Number(game.fen().split(' ')[5]);
    const side = game.turn();
    if (game.automaticOutcome()) {
      throw new PgnError(`The game is already over before move ${moveNo}${side === 'w' ? '.' : '...'} ${token}.`);
    }
    if (!game.moveSan(token)) {
      throw new PgnError(
        `Move ${moveNo}${side === 'w' ? '.' : '...'} ${token} is not legal (or is ambiguous) in this position.`,
      );
    }
  }

  const declared = resultToken ?? headers.Result ?? '*';
  let result: GameResult | null = game.automaticOutcome();
  if (!result && declared !== '*' && RESULT_TOKENS.has(declared)) {
    result = {
      winner: declared === '1-0' ? 'w' : declared === '0-1' ? 'b' : null,
      termination: 'imported',
    };
  }
  return { headers, startFen: game.startFen, moves: game.uciMoves(), result };
}
