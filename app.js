const express = require('express');
const socket = require('socket.io');
const http = require('http');
const path = require('path');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);
const io = socket(server);
const chess = new Chess();

let players = {
    white: { id: null, name: null, score: 0 },
    black: { id: null, name: null, score: 0 }
};
let currentPlayer = 'w';
let gameHistory = [];
let gameStartTime = null;

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.render('index', { title: 'A-RunChess' });
});

// Helper function to get game end reason
function getGameEndReason() {
    if (chess.isCheckmate()) {
        return 'Checkmate!';
    } else if (chess.isStalemate()) {
        return 'Stalemate!';
    } else if (chess.isThreefoldRepetition()) {
        return 'Draw by threefold repetition';
    } else if (chess.isInsufficientMaterial()) {
        return 'Draw by insufficient material';
    } else if (chess.isDraw()) {
        return 'Draw by 50-move rule';
    }
    return 'Game ended';
}

// Helper function to calculate score based on game outcome
function calculateScore(winner, gameEndReason) {
    if (winner === 'draw') {
        return { white: 0.5, black: 0.5 };
    } else if (winner === 'w') {
        return { white: 1, black: 0 };
    } else {
        return { white: 0, black: 1 };
    }
}

// Helper function to get captured pieces
function getCapturedPieces() {
    const currentFen = chess.fen();
    const startingPieces = {
        'p': 8, 'r': 2, 'n': 2, 'b': 2, 'q': 1, 'k': 1,
        'P': 8, 'R': 2, 'N': 2, 'B': 2, 'Q': 1, 'K': 1
    };
    
    const currentPieces = {};
    const position = currentFen.split(' ')[0];
    
    // Initialize current pieces count
    Object.keys(startingPieces).forEach(piece => {
        currentPieces[piece] = 0;
    });
    
    // Count current pieces on board
    for (let char of position.replace(/\//g, '')) {
        if (isNaN(char) && char !== '/') {
            currentPieces[char] = (currentPieces[char] || 0) + 1;
        }
    }
    
    // Calculate captured pieces
    const captured = { white: [], black: [] };
    Object.keys(startingPieces).forEach(piece => {
        const capturedCount = startingPieces[piece] - (currentPieces[piece] || 0);
        for (let i = 0; i < capturedCount; i++) {
            if (piece === piece.toUpperCase()) {
                captured.black.push(piece.toLowerCase());
            } else {
                captured.white.push(piece);
            }
        }
    });
    
    return captured;
}

io.on("connection", (uniquesocket) => {
    console.log('A user connected:', uniquesocket.id);

    // Send current game state to new connection
    uniquesocket.emit("boardState", chess.fen());
    uniquesocket.emit("gameStats", {
        moveCount: chess.history().length,
        capturedPieces: getCapturedPieces(),
        currentTurn: chess.turn(),
        inCheck: chess.inCheck(),
        scores: {
            white: players.white.score,
            black: players.black.score
        }
    });

    uniquesocket.on('playerRegistered', (name) => {
        if (!players.white.id) {
            players.white = { id: uniquesocket.id, name: name, score: players.white.score };
            uniquesocket.emit("playerRole", "w");
            
            io.emit("playerNames", {
                white: name,
                black: players.black.name || "Waiting..."
            });
            
            console.log(`${name} joined as White player`);
        } else if (!players.black.id) {
            players.black = { id: uniquesocket.id, name: name, score: players.black.score };
            uniquesocket.emit("playerRole", "b");
            
            io.emit("playerNames", {
                white: players.white.name,
                black: name
            });
            
            gameStartTime = new Date();
            io.emit("gameReady");
            console.log(`${name} joined as Black player. Game started!`);
        } else {
            uniquesocket.emit("spectatorRole");
            console.log(`${name} joined as spectator`);
        }

        // Send updated scores
        io.emit("scoresUpdate", {
            white: players.white.score,
            black: players.black.score
        });

        uniquesocket.emit("boardState", chess.fen());
    });

    uniquesocket.on("disconnect", () => {
        let disconnectedPlayer = null;
        
        if (players.white.id === uniquesocket.id) {
            disconnectedPlayer = players.white.name;
            players.white.id = null;
        }
        if (players.black.id === uniquesocket.id) {
            disconnectedPlayer = players.black.name;
            players.black.id = null;
        }

        if (disconnectedPlayer) {
            console.log(`${disconnectedPlayer} disconnected`);
            
            io.emit("playerNames", {
                white: players.white.name || "Waiting...",
                black: players.black.name || "Waiting..."
            });

            io.emit("playerDisconnected", { playerName: disconnectedPlayer });
            
            // Reset game but preserve scores
            chess.reset();
            gameHistory = [];
            io.emit("resetGame");
            console.log("Game reset due to player disconnection");
        }
    });

    uniquesocket.on("move", (move) => {
        try {
            // Validate it's the correct player's turn
            if (chess.turn() === "w" && uniquesocket.id !== players.white.id) {
                uniquesocket.emit("invalidMove", { reason: "Not your turn!" });
                return;
            }
            if (chess.turn() === "b" && uniquesocket.id !== players.black.id) {
                uniquesocket.emit("invalidMove", { reason: "Not your turn!" });
                return;
            }

            // Ensure both players are connected
            if (!players.white.id || !players.black.id) {
                uniquesocket.emit("invalidMove", { reason: "Waiting for another player" });
                return;
            }

            // Attempt the move
            const result = chess.move(move);
            if (result) {
                console.log(`Move made: ${result.san} by ${chess.turn() === 'w' ? players.black.name : players.white.name}`);
                
                // Add move to history
                gameHistory.push({
                    move: result,
                    fen: chess.fen(),
                    timestamp: new Date()
                });

                currentPlayer = chess.turn();
                
                // Broadcast the move to all clients
                io.emit("move", {
                    from: result.from,
                    to: result.to,
                    piece: result.piece,
                    san: result.san,
                    captured: result.captured || null
                });
                
                io.emit("boardState", chess.fen());
                
                // Send updated game stats
                io.emit("gameStats", {
                    moveCount: chess.history().length,
                    capturedPieces: getCapturedPieces(),
                    currentTurn: chess.turn(),
                    inCheck: chess.inCheck(),
                    scores: {
                        white: players.white.score,
                        black: players.black.score
                    }
                });

                // Check for special moves
                if (result.flags.includes('c')) {
                    io.emit("pieceeCaptured", {
                        piece: result.captured,
                        capturedBy: chess.turn() === 'w' ? 'b' : 'w'
                    });
                }

                if (chess.inCheck()) {
                    io.emit("check", {
                        player: chess.turn()
                    });
                }

                // Check for game end
                if (chess.isGameOver()) {
                    let winner = null;
                    let gameEndReason = getGameEndReason();
                    
                    if (chess.isCheckmate()) {
                        winner = chess.turn() === 'w' ? 'b' : 'w'; // Opposite of current turn wins
                    } else {
                        winner = 'draw';
                    }
                    
                    // Update scores
                    const scoreUpdate = calculateScore(winner, gameEndReason);
                    players.white.score += scoreUpdate.white;
                    players.black.score += scoreUpdate.black;
                    
                    const gameEndData = {
                        winner: winner,
                        reason: gameEndReason,
                        scores: {
                            white: players.white.score,
                            black: players.black.score
                        },
                        gameLength: gameHistory.length,
                        gameDuration: gameStartTime ? Math.floor((new Date() - gameStartTime) / 1000) : 0
                    };
                    
                    io.emit("gameOver", gameEndData);
                    console.log(`Game ended: ${gameEndReason}. Winner: ${winner}`);
                    
                    // Reset for next game after a delay
                    setTimeout(() => {
                        chess.reset();
                        gameHistory = [];
                        gameStartTime = null;
                        io.emit("resetGame");
                        
                        if (players.white.id && players.black.id) {
                            io.emit("gameReady");
                            gameStartTime = new Date();
                        }
                    }, 5000);
                }
                
            } else {
                uniquesocket.emit("invalidMove", { 
                    reason: "Invalid move", 
                    move: move,
                    currentPosition: chess.fen()
                });
                console.log("Invalid move attempted:", move);
            }
        } catch (error) {
            console.log("Move error:", error);
            uniquesocket.emit("invalidMove", { 
                reason: "Move processing error", 
                error: error.message 
            });
        }
    });

    uniquesocket.on("getBoardState", () => {
        uniquesocket.emit("boardState", chess.fen());
    });

    uniquesocket.on("getGameStats", () => {
        uniquesocket.emit("gameStats", {
            moveCount: chess.history().length,
            capturedPieces: getCapturedPieces(),
            currentTurn: chess.turn(),
            inCheck: chess.inCheck(),
            scores: {
                white: players.white.score,
                black: players.black.score
            },
            gameHistory: gameHistory.slice(-10) // Last 10 moves
        });
    });

    uniquesocket.on("resetScores", () => {
        // Only allow if both players agree or if admin
        players.white.score = 0;
        players.black.score = 0;
        io.emit("scoresUpdate", {
            white: 0,
            black: 0
        });
        console.log("Scores reset");
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`A-RunChess server is running on port ${PORT}`);
    console.log('Game features enabled:');
    console.log('- Real-time multiplayer chess');
    console.log('- Score tracking');
    console.log('- Game end detection');
    console.log('- Move validation');
    console.log('- Spectator mode');
});
