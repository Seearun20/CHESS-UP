const socket = io();
const chess = new Chess();
const boardElement = document.querySelector(".chessboard");

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;
let gameReady = false;

document.getElementById('submit-name').addEventListener('click', () => {
    const playerName = document.getElementById('player-name').value.trim();
    if (playerName) {
        document.getElementById('name-modal').style.display = 'none';
        document.getElementById('loading-overlay').style.display = 'flex';
        socket.emit('playerRegistered', playerName);
    }
});

socket.on("playerNames", (names) => {
    document.getElementById('white-player-name').textContent = names.white;
    document.getElementById('black-player-name').textContent = names.black || "Waiting...";
    document.getElementById('loading-overlay').style.display = 'none';
});

socket.on("gameReady", () => {
    gameReady = true;
    document.getElementById('loading-overlay').style.display = 'none';
    renderBoard();
});

const getPieceUnicode = (piece) => {
    const unicodePieces = {
        p: "♙", r: "♖", n: "♘", b: "♗", q: "♕", k: "♔",
        P: "♟", R: "♜", N: "♞", B: "♝", Q: "♛", K: "♚"
    };
    return unicodePieces[piece] || "";
};

const renderBoard = () => {
    const board = chess.board();
    boardElement.innerHTML = ""; 

    board.forEach((row, index) => {
        row.forEach((square, squareIndex) => {
            const squareElement = document.createElement("div");
            squareElement.classList.add(
                "square",
                (index + squareIndex) % 2 === 0 ? "light" : "dark"
            );

            squareElement.dataset.row = index;
            squareElement.dataset.col = squareIndex;

            if (square) {
                const pieceElement = document.createElement("div");
                pieceElement.classList.add("piece", square.color === "w" ? "white" : "black");
                pieceElement.innerHTML = getPieceUnicode(square.type);
                
                // Only allow dragging if game is ready and it's the player's color
                pieceElement.draggable = gameReady && playerRole === square.color;

                pieceElement.addEventListener("dragstart", (e) => {
                    if (!gameReady) {
                        e.preventDefault();
                        return;
                    }
                    if (pieceElement.draggable) {
                        draggedPiece = pieceElement;
                        sourceSquare = { row: index, col: squareIndex };
                        e.dataTransfer.setData("text/plain", "");
                    }
                });

                pieceElement.addEventListener("dragend", () => {
                    draggedPiece = null;
                    sourceSquare = null;
                });

                squareElement.appendChild(pieceElement);
            }

            squareElement.addEventListener("dragover", (e) => {
                if (gameReady) e.preventDefault();
            });

            squareElement.addEventListener("drop", (e) => {
                if (!gameReady) {
                    e.preventDefault();
                    return;
                }
                e.preventDefault();
                if (draggedPiece) {
                    const targetSquare = {
                        row: parseInt(squareElement.dataset.row),
                        col: parseInt(squareElement.dataset.col)
                    };
                    handleMove(sourceSquare, targetSquare);
                }
            });

            boardElement.appendChild(squareElement);
        });
    });
};

const handleMove = (source, target) => {
    // Additional check to prevent moves before game is ready
    if (!gameReady) return;

    const move = {
        from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
        to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
        promotion: "q"
    };

    const result = chess.move(move);

    if (result) {
        renderBoard();
        socket.emit("move", move);
    }
};

socket.on("playerRole", (role) => {
    playerRole = role;
    renderBoard();
});

socket.on("spectatorRole", function () {
    playerRole = null;
    gameReady = false;
    renderBoard();
});

socket.on("move", function (move) {
    chess.move(move);
    renderBoard();
});

socket.on("playerDisconnected", () => {
    console.log("Opponent disconnected. Resetting game...");
    
    chess.reset();
    renderBoard();
    gameReady = false;
    
    socket.emit("resetGame");
    
    alert("Opponent disconnected. Waiting for a new player...");
});

socket.on("connect", () => {
    console.log("Reconnected to server.");
    socket.emit("getBoardState");
});

socket.on("boardState", (fen) => {
    console.log("Updating board to latest state:", fen);
    chess.load(fen);
    renderBoard();
});

socket.on("resetGame", () => {
    console.log("Game reset by server.");
    gameReady = false;
    chess.reset();
    renderBoard();
});

renderBoard();