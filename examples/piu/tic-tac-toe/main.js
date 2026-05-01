import {} from "piu/MC";

const backgroundSkin = new Skin({ fill: "#f7f4ec" });

const titleStyle = new Style({
  font: "OpenSans-Regular-24",
  color: "#263238",
  horizontal: "center",
  vertical: "middle",
});

const smallStyle = new Style({
  font: "OpenSans-Regular-24",
  color: "#263238",
  horizontal: "center",
  vertical: "middle",
});

const COLORS = {
  board: "#263238",
  cell: "#fffdf7",
  x: "#d64545",
  o: "#1e7f8f",
  win: "#3d8b40",
};

const WINS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function newGame() {
  return {
    cells: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    turn: 1,
    winner: 0,
    winLine: null,
    moves: 0,
  };
}

function findWinner(cells) {
  for (const line of WINS) {
    const value = cells[line[0]];
    if (value && value === cells[line[1]] && value === cells[line[2]]) {
      return { winner: value, line };
    }
  }
  return { winner: 0, line: null };
}

class BoardBehavior extends Behavior {
  onCreate(port, game) {
    this.game = game;
    this.layout = {
      board: 0,
      cell: 0,
      line: 4,
      left: 0,
      top: 0,
    };
  }

  onDraw(port) {
    const width = port.width;
    const height = port.height;
    const line = this.layout.line;
    const maxBoard = Math.min(width - 32, height - 82, 162);
    const cell = Math.floor((maxBoard - line * 2) / 3);
    const board = cell * 3 + line * 2;
    const left = Math.floor((width - board) / 2);
    const top = 42;

    this.layout.board = board;
    this.layout.cell = cell;
    this.layout.left = left;
    this.layout.top = top;

    port.fillColor("#f7f4ec", 0, 0, width, height);
    port.drawString("Tic Tac Toe", titleStyle, "#263238", 0, 4, width, 32);
    port.drawString("RESET", smallStyle, "#263238", width - 86, 4, 78, 32);

    port.fillColor(COLORS.board, left, top, board, board);

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const index = row * 3 + col;
        const x = left + col * (cell + line);
        const y = top + row * (cell + line);
        port.fillColor(COLORS.cell, x, y, cell, cell);
        this.drawMark(
          port,
          this.game.cells[index],
          x,
          y,
          cell,
          this.isWinningCell(index),
        );
      }
    }

    port.drawString(
      this.statusText(),
      smallStyle,
      "#263238",
      0,
      height - 36,
      width,
      30,
    );
  }

  drawMark(port, value, x, y, size, winning) {
    if (!value) return;

    const color = winning ? COLORS.win : value === 1 ? COLORS.x : COLORS.o;
    const pad = Math.floor(size * 0.22);
    const thick = Math.max(5, Math.floor(size * 0.12));

    if (value === 1) {
      const steps = 8;
      const span = size - pad * 2 - thick;
      for (let i = 0; i < steps; i++) {
        const offset = Math.floor((span * i) / (steps - 1));
        port.fillColor(color, x + pad + offset, y + pad + offset, thick, thick);
        port.fillColor(
          color,
          x + size - pad - thick - offset,
          y + pad + offset,
          thick,
          thick,
        );
      }
      return;
    }

    port.fillColor(color, x + pad, y + pad, size - pad * 2, thick);
    port.fillColor(
      color,
      x + pad,
      y + size - pad - thick,
      size - pad * 2,
      thick,
    );
    port.fillColor(color, x + pad, y + pad, thick, size - pad * 2);
    port.fillColor(
      color,
      x + size - pad - thick,
      y + pad,
      thick,
      size - pad * 2,
    );
  }

  isWinningCell(index) {
    return this.game.winLine && this.game.winLine.indexOf(index) >= 0;
  }

  statusText() {
    if (this.game.winner) return `${this.game.winner === 1 ? "X" : "O"} wins`;
    if (this.game.moves === 9) return "Draw";
    return `${this.game.turn === 1 ? "X" : "O"} turn`;
  }

  onTouchEnded(port, id, x, y) {
    if (y < 40 && x > port.width - 96) {
      this.reset(port);
      return;
    }

    const index = this.cellAt(x, y);
    if (index >= 0) {
      this.playCell(port, index);
    }
  }

  cellAt(x, y) {
    const { board, left, top } = this.layout;
    if (x < left || x >= left + board || y < top || y >= top + board) return -1;

    const col = Math.floor(((x - left) * 3) / board);
    const row = Math.floor(((y - top) * 3) / board);
    return row * 3 + col;
  }

  playCell(port, index) {
    if (this.game.winner || this.game.moves === 9) {
      this.reset(port);
      return;
    }
    if (this.game.cells[index]) return;

    this.game.cells[index] = this.game.turn;
    this.game.moves++;

    const result = findWinner(this.game.cells);
    this.game.winner = result.winner;
    this.game.winLine = result.line;

    if (!this.game.winner && this.game.moves < 9) {
      this.game.turn = this.game.turn === 1 ? 2 : 1;
    }

    port.invalidate();
  }

  reset(port) {
    const fresh = newGame();
    this.game.cells = fresh.cells;
    this.game.turn = fresh.turn;
    this.game.winner = fresh.winner;
    this.game.winLine = fresh.winLine;
    this.game.moves = fresh.moves;
    port.invalidate();
  }
}

class TicTacToeBehavior extends Behavior {
  onCreate(application, game) {
    this.game = game;
    application.add(
      new Port(game, {
        active: true,
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        Behavior: BoardBehavior,
      }),
    );
  }
}

const TicTacToeApp = Application.template(($) => ({
  skin: backgroundSkin,
  Behavior: TicTacToeBehavior,
}));

export default function () {
  return new TicTacToeApp(newGame(), {
    commandListLength: 4096,
    displayListLength: 4096,
    touchCount: 1,
  });
}
