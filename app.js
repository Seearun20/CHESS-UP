const express = require('express');
const socket = require('socket.io');
const http = require('http');
const path = require('path');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);
const io = socket(server);

// Store multiple games
let games = {};
let gameCounter = 1000; // Start from 1000 for readable game IDs

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.render('index', { title: 'A-RunChess' });
});

// Game class to manage individual games
class ChessGame {
    constructor(gameId) {
        this.gameId = gameId;
        this.chess = new Chess();
        this.players = {
            white: { id: null, name: null, score: 0 },
            black: { id: null, name: null, score: 0 }
        };
        this.spectators = [];
        this.gameHistory = [];
        this.gameStartTime = null;
        this.gameInProgress = false;
    }

    // Helper function to get game end reason
    getGameEndReason() {
        if (this.chess.isCheckmate()) {
            return 'Checkmate!';
        } else if (this.chess.isStalemate()) {
            return 'Stalemate!';
        } else if (this.chess.isThreefoldRepetition()) {
            return 'Draw by threefold repetition';
        } else if (this.chess.isInsufficientMaterial()) {
            return 'Draw by insufficient material';
        } else if (this.chess.isDraw()) {
            return 'Draw by 50-move rule';
        }
        return 'Game ended';
    }

    // Helper function to calculate score
    calculateScore(winner) {
        if (winner === 'draw') {
            return { white: 0.5, black: 0.5 };
        } else if (winner === 'w') {
            return { white: 1, black: 0 };
        } else {
            return { white: 0, black: 1 };
        }
    }

    // Helper function to get captured pieces
    getCapturedPieces() {
        const currentFen = this.chess.fen();
        const startingPieces = {
            'p': 8, 'r': 2, 'n': 2, 'b': 2, 'q': 1, 'k': 1,
            'P': 8, 'R': 2, 'N': 2, 'B': 2, 'Q': 1, 'K': 1
        };
        
        const currentPieces = {};
        const position = currentFen.split(' ')[0];
        
        Object.keys(startingPieces).forEach(piece => {
            currentPieces[piece] = 0;
        });
        
        for (let char of position.replace(/\//g, '')) {
            if (isNaN(char) && char !== '/') {
                currentPieces[char] = (currentPieces[char] || 0) + 1;
            }
        }
        
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

    // Send game state to specific socket
    sendGameState(socket) {
        socket.emit("boardState", this.chess.fen());
        socket.emit("gameStats", {
            moveCount: this.chess.history().length,
            capturedPieces: this.getCapturedPieces(),
            currentTurn: this.chess.turn(),
            inCheck: this.chess.inCheck(),
            scores: {
                white: this.players.white.score,
                black: this.players.black.score
            },
            gameInProgress: this.gameInProgress,
            gameId: this.gameId
        });
    }

    // Broadcast to all players in this game
    broadcast(event, data) {
        const roomName = `game-${this.gameId}`;
        io.to(roomName).emit(event, data);
    }

    // Add player to game
    addPlayer(socket, name) {
        const roomName = `game-${this.gameId}`;
        socket.join(roomName);

        if (!this.players.white.id) {
            this.players.white = { id: socket.id, name: name, score: this.players.white.score };
            socket.emit("playerRole", "w");
            socket.emit("gameId", this.gameId);
            
            this.broadcast("playerNames", {
                white: name,
                black: this.players.black.name || "Waiting..."
            });
            
            console.log(`${name} joined game ${this.gameId} as White player`);
            
            // Send initial board state
            this.sendGameState(socket);
            
            return 'white';
        } else if (!this.players.black.id) {
            this.players.black = { id: socket.id, name: name, score: this.players.black.score };
            socket.emit("playerRole", "b");
            socket.emit("gameId", this.gameId);
            
            this.broadcast("playerNames", {
                white: this.players.white.name,
                black: name
            });
            
            // Game is now ready to start
            this.gameStartTime = new Date();
            this.gameInProgress = true;
            
            // Send board state to both players
            this.broadcast("boardState", this.chess.fen());
            this.broadcast("gameStats", {
                moveCount: this.chess.history().length,
                capturedPieces: this.getCapturedPieces(),
                currentTurn: this.chess.turn(),
                inCheck: this.chess.inCheck(),
                scores: {
                    white: this.players.white.score,
                    black: this.players.black.score
                },
                gameInProgress: this.gameInProgress,
                gameId: this.gameId
            });
            
            this.broadcast("gameReady");
            console.log(`${name} joined game ${this.gameId} as Black player. Game started!`);
            return 'black';
        } else {
            // Add as spectator
            this.spectators.push({ id: socket.id, name: name });
            socket.emit("spectatorRole");
            socket.emit("gameId", this.gameId);
            
            // Send current game state to spectator
            this.sendGameState(socket);
            
            console.log(`${name} joined game ${this.gameId} as spectator`);
            return 'spectator';
        }
    }

    // Remove player from game
    removePlayer(socketId) {
        let disconnectedPlayer = null;
        let playerRole = null;
        
        if (this.players.white.id === socketId) {
            disconnectedPlayer = this.players.white.name;
            playerRole = 'white';
            this.players.white.id = null;
            this.players.white.name = null;
        } else if (this.players.black.id === socketId) {
            disconnectedPlayer = this.players.black.name;
            playerRole = 'black';
            this.players.black.id = null;
            this.players.black.name = null;
        } else {
            // Remove from spectators
            this.spectators = this.spectators.filter(spec => spec.id !== socketId);
            return null;
        }

        if (disconnectedPlayer) {
            console.log(`${disconnectedPlayer} disconnected from game ${this.gameId}`);
            
            this.broadcast("playerNames", {
                white: this.players.white.name || "Waiting...",
                black: this.players.black.name || "Waiting..."
            });

            this.broadcast("playerDisconnected", { 
                playerName: disconnectedPlayer,
                gameId: this.gameId 
            });
            
            // Reset game but preserve scores
            this.chess.reset();
            this.gameHistory = [];
            this.gameInProgress = false;
            this.broadcast("resetGame");
            console.log(`Game ${this.gameId} reset due to player disconnection`);
        }

        return { disconnectedPlayer, playerRole };
    }

    // Check if game is empty (no players or spectators)
    isEmpty() {
        return !this.players.white.id && !this.players.black.id && this.spectators.length === 0;
    }

    // Get game info for listing
    getGameInfo() {
        return {
            gameId: this.gameId,
            players: {
                white: this.players.white.name || null,
                black: this.players.black.name || null
            },
            spectatorCount: this.spectators.length,
            gameInProgress: this.gameInProgress,
            moveCount: this.chess.history().length
        };
    }
}

// Create new game
function createNewGame() {
    const gameId = gameCounter++;
    games[gameId] = new ChessGame(gameId);
    console.log(`Created new game with ID: ${gameId}`);
    return games[gameId];
}

// Get available games for spectating
function getAvailableGames() {
    const availableGames = [];
    Object.values(games).forEach(game => {
        if (game.gameInProgress || game.players.white.id || game.players.black.id) {
            availableGames.push(game.getGameInfo());
        }
    });
    return availableGames;
}

// Clean up empty games
function cleanupEmptyGames() {
    Object.keys(games).forEach(gameId => {
        if (games[gameId].isEmpty()) {
            console.log(`Cleaning up empty game ${gameId}`);
            delete games[gameId];
        }
    });
}

// Run cleanup every 5 minutes
setInterval(cleanupEmptyGames, 5 * 60 * 1000);

io.on("connection", (uniquesocket) => {
    console.log('A user connected:', uniquesocket.id);
    let currentGame = null;

    // Send available games for spectating
    uniquesocket.emit("availableGames", getAvailableGames());

    uniquesocket.on('playerRegistered', (data) => {
        const { name, action, gameId } = data;
        
        if (action === 'spectate' && gameId && games[gameId]) {
            // Join existing game as spectator
            currentGame = games[gameId];
            const role = currentGame.addPlayer(uniquesocket, name);
            
            // Send current game state
            currentGame.sendGameState(uniquesocket);
            
            // Send updated scores
            currentGame.broadcast("scoresUpdate", {
                white: currentGame.players.white.score,
                black: currentGame.players.black.score
            });
        } else if (action === 'newGame') {
            // Create new game or join existing waiting game
            let foundGame = null;
            
            // Look for a game that needs players (prioritize games with one player)
            Object.values(games).forEach(game => {
                if (!foundGame && (!game.players.white.id || !game.players.black.id) && !game.gameInProgress) {
                    foundGame = game;
                }
            });
            
            if (!foundGame) {
                foundGame = createNewGame();
            }
            
            currentGame = foundGame;
            const role = currentGame.addPlayer(uniquesocket, name);
            
            console.log(`Player ${name} assigned role: ${role} in game ${currentGame.gameId}`);
            
        } else {
            // Default behavior - try to join any available game or create new one
            let foundGame = null;
            
            Object.values(games).forEach(game => {
                if (!foundGame && (!game.players.white.id || !game.players.black.id) && !game.gameInProgress) {
                    foundGame = game;
                }
            });
            
            if (!foundGame) {
                foundGame = createNewGame();
            }
            
            currentGame = foundGame;
            const role = currentGame.addPlayer(uniquesocket, name);
            
            console.log(`Player ${name} assigned role: ${role} in game ${currentGame.gameId}`);
        }
    });

    uniquesocket.on("disconnect", () => {
        console.log('User disconnected:', uniquesocket.id);
        if (currentGame) {
            const result = currentGame.removePlayer(uniquesocket.id);
            
            // Update available games list for all connected clients
            io.emit("availableGames", getAvailableGames());
        }
    });

    uniquesocket.on("move", (move) => {
        if (!currentGame) {
            uniquesocket.emit("invalidMove", { reason: "No active game" });
            return;
        }
        
        try {
            // Validate it's the correct player's turn
            if (currentGame.chess.turn() === "w" && uniquesocket.id !== currentGame.players.white.id) {
                uniquesocket.emit("invalidMove", { reason: "Not your turn!" });
                return;
            }
            if (currentGame.chess.turn() === "b" && uniquesocket.id !== currentGame.players.black.id) {
                uniquesocket.emit("invalidMove", { reason: "Not your turn!" });
                return;
            }

            // Ensure both players are connected
            if (!currentGame.players.white.id || !currentGame.players.black.id) {
                uniquesocket.emit("invalidMove", { reason: "Waiting for another player" });
                return;
            }

            // Attempt the move
            const result = currentGame.chess.move(move);
            if (result) {
                console.log(`Move made in game ${currentGame.gameId}: ${result.san} by ${currentGame.chess.turn() === 'w' ? currentGame.players.black.name : currentGame.players.white.name}`);
                
                // Add move to history
                currentGame.gameHistory.push({
                    move: result,
                    fen: currentGame.chess.fen(),
                    timestamp: new Date()
                });

                // Broadcast the move to all clients in this game
                currentGame.broadcast("move", {
                    from: result.from,
                    to: result.to,
                    piece: result.piece,
                    san: result.san,
                    captured: result.captured || null
                });
                
                currentGame.broadcast("boardState", currentGame.chess.fen());
                
                // Send updated game stats
                currentGame.broadcast("gameStats", {
                    moveCount: currentGame.chess.history().length,
                    capturedPieces: currentGame.getCapturedPieces(),
                    currentTurn: currentGame.chess.turn(),
                    inCheck: currentGame.chess.inCheck(),
                    scores: {
                        white: currentGame.players.white.score,
                        black: currentGame.players.black.score
                    },
                    gameId: currentGame.gameId
                });

                // Check for special moves
                if (result.flags.includes('c')) {
                    currentGame.broadcast("pieceCaptured", {
                        piece: result.captured,
                        capturedBy: currentGame.chess.turn() === 'w' ? 'b' : 'w'
                    });
                }

                if (currentGame.chess.inCheck()) {
                    currentGame.broadcast("check", {
                        player: currentGame.chess.turn()
                    });
                }

                // Check for game end
                if (currentGame.chess.isGameOver()) {
                    let winner = null;
                    let gameEndReason = currentGame.getGameEndReason();
                    
                    if (currentGame.chess.isCheckmate()) {
                        winner = currentGame.chess.turn() === 'w' ? 'b' : 'w';
                    } else {
                        winner = 'draw';
                    }
                    
                    // Update scores
                    const scoreUpdate = currentGame.calculateScore(winner);
                    currentGame.players.white.score += scoreUpdate.white;
                    currentGame.players.black.score += scoreUpdate.black;
                    
                    const gameEndData = {
                        winner: winner,
                        reason: gameEndReason,
                        scores: {
                            white: currentGame.players.white.score,
                            black: currentGame.players.black.score
                        },
                        gameLength: currentGame.gameHistory.length,
                        gameDuration: currentGame.gameStartTime ? Math.floor((new Date() - currentGame.gameStartTime) / 1000) : 0,
                        gameId: currentGame.gameId
                    };
                    
                    currentGame.broadcast("gameOver", gameEndData);
                    console.log(`Game ${currentGame.gameId} ended: ${gameEndReason}. Winner: ${winner}`);
                    
                    // Reset for next game after a delay
                    setTimeout(() => {
                        currentGame.chess.reset();
                        currentGame.gameHistory = [];
                        currentGame.gameStartTime = null;
                        currentGame.gameInProgress = false;
                        currentGame.broadcast("resetGame");
                        
                        if (currentGame.players.white.id && currentGame.players.black.id) {
                            currentGame.broadcast("gameReady");
                            currentGame.gameStartTime = new Date();
                            currentGame.gameInProgress = true;
                        }
                        
                        // Update available games list
                        io.emit("availableGames", getAvailableGames());
                    }, 5000);
                }
                
            } else {
                uniquesocket.emit("invalidMove", { 
                    reason: "Invalid move", 
                    move: move,
                    currentPosition: currentGame.chess.fen()
                });
                console.log("Invalid move attempted in game", currentGame.gameId, ":", move);
            }
        } catch (error) {
            console.log("Move error in game", currentGame.gameId, ":", error);
            uniquesocket.emit("invalidMove", { 
                reason: "Move processing error", 
                error: error.message 
            });
        }
    });

    uniquesocket.on("getBoardState", () => {
        if (currentGame) {
            currentGame.sendGameState(uniquesocket);
        }
    });

    uniquesocket.on("getGameStats", () => {
        if (currentGame) {
            uniquesocket.emit("gameStats", {
                moveCount: currentGame.chess.history().length,
                capturedPieces: currentGame.getCapturedPieces(),
                currentTurn: currentGame.chess.turn(),
                inCheck: currentGame.chess.inCheck(),
                scores: {
                    white: currentGame.players.white.score,
                    black: currentGame.players.black.score
                },
                gameHistory: currentGame.gameHistory.slice(-10),
                gameId: currentGame.gameId
            });
        }
    });

    uniquesocket.on("getAvailableGames", () => {
        uniquesocket.emit("availableGames", getAvailableGames());
    });

    uniquesocket.on("resetScores", () => {
        if (currentGame) {
            currentGame.players.white.score = 0;
            currentGame.players.black.score = 0;
            currentGame.broadcast("scoresUpdate", {
                white: 0,
                black: 0
            });
            console.log(`Scores reset in game ${currentGame.gameId}`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`A-RunChess Multi-Game server is running on port ${PORT}`);
    console.log('Game features enabled:');
    console.log('- Multiple concurrent games');
    console.log('- Game ID system');
    console.log('- Real-time multiplayer chess');
    console.log('- Spectator mode');
    console.log('- Score tracking per game');
    console.log('- Game end detection');
    console.log('- Move validation');
});