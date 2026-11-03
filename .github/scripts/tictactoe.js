// Tic-tac-toe played through GitHub Issues.
// Visitors play X by opening an issue titled "ttt|move|<0-8>"; the bot answers with O.
// Reads ISSUE_TITLE / ISSUE_USER from env, updates game/state.json and the README board,
// and writes `changed` + `message` to $GITHUB_OUTPUT for the workflow.

const fs = require('fs');
const path = require('path');

const ROOT = process.env.GITHUB_WORKSPACE || process.cwd();
const STATE_FILE = path.join(ROOT, 'game', 'state.json');
const README_FILE = path.join(ROOT, 'README.md');
const REPO = process.env.GITHUB_REPOSITORY || 'TeJota1337/TeJota1337';
const START = '<!-- TTT:START -->';
const END = '<!-- TTT:END -->';

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function emptyBoard() {
  return Array(9).fill('');
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { board: emptyBoard(), stats: { visitors: 0, bot: 0, draws: 0 }, lastResult: '', recent: [] };
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function winner(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(Boolean) ? 'draw' : null;
}

function findLineMove(board, mark) {
  for (const line of LINES) {
    const marks = line.map((i) => board[i]);
    if (marks.filter((m) => m === mark).length === 2 && marks.includes('')) {
      return line[marks.indexOf('')];
    }
  }
  return null;
}

function pick(cells, board) {
  const free = cells.filter((i) => !board[i]);
  return free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

// Win > block > center > corner > side. Beatable with a fork, on purpose.
function botMove(board) {
  return findLineMove(board, 'O')
    ?? findLineMove(board, 'X')
    ?? pick([4], board)
    ?? pick([0, 2, 6, 8], board)
    ?? pick([1, 3, 5, 7], board);
}

function issueLink(title, body) {
  return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

function renderBoard(state) {
  const body = 'Just click **Create** below — no need to write anything!\n\n'
    + 'The bot will make its move and update the board in about a minute. ⏱️';
  const icon = { X: '❌', O: '⭕' };
  const rows = [0, 1, 2].map((r) => {
    const cells = [0, 1, 2].map((c) => {
      const i = r * 3 + c;
      const content = state.board[i]
        ? icon[state.board[i]]
        : `<a href="${issueLink(`ttt|move|${i}`, body)}">⬜</a>`;
      return `    <td align="center" width="60" height="60">${content}</td>`;
    });
    return `  <tr>\n${cells.join('\n')}\n  </tr>`;
  });

  const { visitors, bot, draws } = state.stats;
  const recent = state.recent.length
    ? state.recent.map((r) => `<a href="https://github.com/${r.user}">@${r.user}</a>`).join(' · ')
    : '_nobody yet — be the first!_';

  return [
    START,
    '<p align="center">You are <b>❌</b>, my bot is <b>⭕</b>. Click an empty square to play! 👇</p>',
    '',
    '<table align="center">',
    rows.join('\n'),
    '</table>',
    '',
    `<p align="center">🏆 Visitors <b>${visitors}</b> &nbsp;|&nbsp; 🤖 Bot <b>${bot}</b> &nbsp;|&nbsp; 🤝 Draws <b>${draws}</b></p>`,
    state.lastResult ? `<p align="center"><i>Last game: ${state.lastResult}</i></p>` : '',
    '',
    `<p align="center">Recent players: ${recent}</p>`,
    '',
    `<p align="center"><sub>Stuck? <a href="${issueLink('ttt|new', body)}">Start a new game</a> · You need to be logged in to GitHub to play.</sub></p>`,
    END,
  ].filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n');
}

function setOutput(changed, message) {
  const out = process.env.GITHUB_OUTPUT;
  const text = `changed=${changed}\nmessage<<__MSG__\n${message}\n__MSG__\n`;
  if (out) fs.appendFileSync(out, text);
  else console.log(text);
}

function endGame(state, result, user) {
  if (result === 'X') {
    state.stats.visitors++;
    state.lastResult = `@${user} beat the bot! 🎉`;
  } else if (result === 'O') {
    state.stats.bot++;
    state.lastResult = `the bot beat @${user}. 🤖`;
  } else {
    state.stats.draws++;
    state.lastResult = `draw with @${user}. 🤝`;
  }
  state.board = emptyBoard();
}

function main() {
  const title = (process.env.ISSUE_TITLE || '').trim();
  const user = process.env.ISSUE_USER || 'someone';
  const state = loadState();
  const back = `[Back to the board](https://github.com/${REPO.split('/')[0]})`;
  let message;

  if (title === 'ttt|new') {
    state.board = emptyBoard();
    message = `🔄 New game started! ${back}`;
  } else {
    const match = /^ttt\|move\|([0-8])$/.exec(title);
    if (!match) {
      setOutput(false, `🤔 I couldn't understand this move. Use the links on the board! ${back}`);
      return;
    }
    const cell = Number(match[1]);
    if (state.board[cell]) {
      setOutput(false, `😅 That square was already taken — someone probably played right before you. Try again! ${back}`);
      return;
    }

    state.board[cell] = 'X';
    let result = winner(state.board);
    let botCell = null;
    if (!result) {
      botCell = botMove(state.board);
      state.board[botCell] = 'O';
      result = winner(state.board);
    }

    message = `You played ❌ on square ${cell + 1}.`;
    if (botCell !== null) message += ` The bot answered ⭕ on square ${botCell + 1}.`;
    if (result === 'X') message += '\n\n🎉 **You win!** A new game has started.';
    else if (result === 'O') message += '\n\n🤖 **The bot wins!** A new game has started — revenge?';
    else if (result === 'draw') message += '\n\n🤝 **Draw!** A new game has started.';
    message += `\n\n${back}`;

    if (result) endGame(state, result, user);
    state.recent = [{ user }, ...state.recent.filter((r) => r.user !== user)].slice(0, 5);
  }

  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');

  const readme = fs.readFileSync(README_FILE, 'utf8');
  const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);
  fs.writeFileSync(README_FILE, readme.replace(pattern, renderBoard(state)));

  setOutput(true, message);
}

if (require.main === module) main();

module.exports = { renderBoard, loadState };
