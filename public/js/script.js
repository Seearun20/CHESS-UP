// Chess game client-side logic
const socket = io();

// Add these variables at the top
let selectedGameId = null;
let isSpectator = false;
let availableGames = [];

let draggedElement = null;
let draggedFrom = null;
let playerRole = null;
let gameActive = false;
let currentTurn = 'w';
let gameStats = {
    moveCount: 0,
    capturedPieces: { white: [], black: [] },
    inCheck: false,
    scores: { white: 0, black: 0 }
};

// Chess piece symbols
const pieces = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
};

// Initialize the game
document.addEventListener('DOMContentLoaded', function() {
    showWelcomeModal(); // Changed from showNameModal
    createBoard();
    setupEventListeners();
});

socket.on('availableGames', (games) => {
    updateGamesList(games);
});

socket.on('spectatorRole', () => {
    isSpectator = true;
    gameActive = true; // Spectators can see the game
    showSpectatorIndicator();
    hideLoadingOverlay();
    showSuccess('Now spectating the game!');
});

// Show name input modal
function showWelcomeModal() {
    document.getElementById('welcome-modal').style.display = 'flex';
    // Request available games when modal opens
    socket.emit('getAvailableGames');
}

// Setup event listeners
function setupEventListeners() {
    // New game button
    document.getElementById('new-game-btn').addEventListener('click', function() {
        const name = document.getElementById('player-name').value.trim();
        if (name) {
            socket.emit('playerRegistered', { name: name, action: 'newGame' });
            document.getElementById('welcome-modal').style.display = 'none';
            showLoadingOverlay();
        } else {
            showError('Please enter your name');
        }
    });

    // Spectate button
    document.getElementById('spectate-btn').addEventListener('click', function() {
        const name = document.getElementById('player-name').value.trim();
        if (name) {
            showSpectateModal();
        } else {
            showError('Please enter your name');
        }
    });

    // Back to welcome
    document.getElementById('back-to-welcome').addEventListener('click', function() {
        document.getElementById('spectate-modal').style.display = 'none';
        document.getElementById('welcome-modal').style.display = 'flex';
    });

    // Refresh games
    document.getElementById('refresh-games').addEventListener('click', function() {
        socket.emit('getAvailableGames');
        showLoadingGames();
    });

    // Enter key support
    document.getElementById('player-name').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('new-game-btn').click();
        }
    });
}

function showSpectateModal() {
    document.getElementById('welcome-modal').style.display = 'none';
    document.getElementById('spectate-modal').style.display = 'flex';
    socket.emit('getAvailableGames');
    showLoadingGames();
}

function showLoadingGames() {
    const gamesList = document.getElementById('games-list');
    gamesList.innerHTML = '<div class="loading-games">Loading games...</div>';
}

function updateGamesList(games) {
    const gamesList = document.getElementById('games-list');
    availableGames = games;
    
    if (games.length === 0) {
        gamesList.innerHTML = '<div class="empty-games">No active games available for spectating</div>';
        return;
    }
    
    gamesList.innerHTML = '';
    
    games.forEach(game => {
        const gameItem = document.createElement('div');
        gameItem.classList.add('game-item');
        gameItem.dataset.gameId = game.gameId;
        
        const statusClass = game.gameInProgress ? 'status-active' : 'status-waiting';
        const statusText = game.gameInProgress ? 'Active' : 'Waiting';
        
        gameItem.innerHTML = `
            <div class="game-info">
                <div>
                    <div class="game-players">
                        ${game.players.white || 'Waiting...'} vs ${game.players.black || 'Waiting...'}
                    </div>
                    <div class="game-meta">
                        <span>Game #${game.gameId}</span>
                        <span>Moves: ${game.moveCount}</span>
                        <span>Spectators: ${game.spectatorCount}</span>
                    </div>
                </div>
                <div class="game-status-badge ${statusClass}">
                    ${statusText}
                </div>
            </div>
        `;
        
        gameItem.addEventListener('click', () => selectGame(game.gameId, gameItem));
        gamesList.appendChild(gameItem);
    });
    
    // Add spectate button
    const spectateButton = document.createElement('button');
    spectateButton.id = 'confirm-spectate';
    spectateButton.className = 'w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-colors mt-4';
    spectateButton.textContent = '👁️ Spectate Selected Game';
    spectateButton.disabled = true;
    spectateButton.style.opacity = '0.5';
    
    spectateButton.addEventListener('click', function() {
        if (selectedGameId) {
            const name = document.getElementById('player-name').value.trim();
            socket.emit('playerRegistered', { 
                name: name, 
                action: 'spectate', 
                gameId: selectedGameId 
            });
            document.getElementById('spectate-modal').style.display = 'none';
            isSpectator = true;
            showSpectatorIndicator();
        }
    });
    
    gamesList.appendChild(spectateButton);
}
// Show loading overlay
function showLoadingOverlay() {
    document.getElementById('loading-overlay').style.display = 'flex';
}

// Hide loading overlay
function hideLoadingOverlay() {
    document.getElementById('loading-overlay').style.display = 'none';
}

// Create the chessboard
function createBoard() {
    const board = document.querySelector('.chessboard');
    board.innerHTML = '';
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.classList.add((row + col) % 2 === 0 ? 'light' : 'dark');
            square.dataset.row = row;
            square.dataset.col = col;
            square.dataset.square = String.fromCharCode(97 + col) + (8 - row);
            
            // Add drag and drop event listeners
            square.addEventListener('dragover', handleDragOver);
            square.addEventListener('drop', handleDrop);
            square.addEventListener('click', handleSquareClick);
            
            board.appendChild(square);
        }
    }
}

// Update board with current position
function updateBoard(fen) {
    const board = document.querySelector('.chessboard');
    const squares = board.querySelectorAll('.square');
    
    // Parse FEN string
    const fenParts = fen.split(' ');
    const position = fenParts[0];
    currentTurn = fenParts[1];
    
    // Clear all squares
    squares.forEach(square => {
        square.innerHTML = '';
        square.classList.remove('selected', 'valid-move', 'last-move', 'check');
    });
    
    // Place pieces
    const rows = position.split('/');
    let squareIndex = 0;
    
    for (let row = 0; row < 8; row++) {
        let col = 0;
        for (let char of rows[row]) {
            if (isNaN(char)) {
                // It's a piece
                const square = squares[squareIndex];
                const piece = document.createElement('div');
                piece.classList.add('piece');
                piece.classList.add(char === char.toUpperCase() ? 'white' : 'black');
                piece.textContent = pieces[char];
                piece.draggable = true;
                piece.dataset.piece = char;
                piece.dataset.square = square.dataset.square;
                
                // Add drag event listeners
                piece.addEventListener('dragstart', handleDragStart);
                piece.addEventListener('dragend', handleDragEnd);
                
                square.appendChild(piece);
                squareIndex++;
                col++;
            } else {
                // It's empty squares
                const emptySquares = parseInt(char);
                squareIndex += emptySquares;
                col += emptySquares;
            }
        }
    }
    
    updateTurnIndicator();
    updateGameStatus();
}

// Handle drag start
function handleDragStart(e) {
    if (!gameActive) return;
    
    const piece = e.target;
    const pieceColor = piece.classList.contains('white') ? 'w' : 'b';
    
    // Check if it's the player's turn and piece
    if (pieceColor !== playerRole || currentTurn !== playerRole) {
        e.preventDefault();
        showError("It's not your turn!");
        return;
    }
    
    draggedElement = piece;
    draggedFrom = piece.dataset.square;
    piece.classList.add('dragging');
    
    // Highlight valid moves
    highlightValidMoves(draggedFrom);
}

// Handle drag end
function handleDragEnd(e) {
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
        draggedElement = null;
        draggedFrom = null;
        clearHighlights();
    }
}

// Handle drag over
function handleDragOver(e) {
    e.preventDefault();
}

// Handle drop
function handleDrop(e) {
    e.preventDefault();
    
    if (!draggedElement || !gameActive) return;
    
    const targetSquare = e.currentTarget;
    const to = targetSquare.dataset.square;
    
    if (draggedFrom === to) return;
    
    // Try to make the move
    const move = {
        from: draggedFrom,
        to: to,
        promotion: 'q' // Default promotion to queen
    };
    
    socket.emit('move', move);
}

// Handle square click (for mobile/touch devices)
let selectedSquare = null;

function handleSquareClick(e) {
    if (!gameActive) return;
    
    const square = e.currentTarget;
    const piece = square.querySelector('.piece');
    
    if (selectedSquare) {
        // Second click - try to move
        const to = square.dataset.square;
        const move = {
            from: selectedSquare,
            to: to,
            promotion: 'q'
        };
        
        socket.emit('move', move);
        clearSelection();
    } else if (piece) {
        // First click - select piece
        const pieceColor = piece.classList.contains('white') ? 'w' : 'b';
        
        if (pieceColor === playerRole && currentTurn === playerRole) {
            selectedSquare = square.dataset.square;
            square.classList.add('selected');
            highlightValidMoves(selectedSquare);
        } else {
            showError("It's not your turn!");
        }
    }
}
function selectGame(gameId, gameElement) {
    // Remove previous selection
    document.querySelectorAll('.game-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Select current game
    gameElement.classList.add('selected');
    selectedGameId = gameId;
    
    // Enable spectate button
    const spectateButton = document.getElementById('confirm-spectate');
    spectateButton.disabled = false;
    spectateButton.style.opacity = '1';
}

function showSpectatorIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'spectator-indicator';
    indicator.innerHTML = '👁️ SPECTATING';
    document.body.appendChild(indicator);
}

function showGameIdDisplay(gameId) {
    const display = document.createElement('div');
    display.className = 'game-id-display';
    display.innerHTML = `Game #${gameId}`;
    document.body.appendChild(display);
}

// Clear selection
function clearSelection() {
    selectedSquare = null;
    document.querySelectorAll('.square').forEach(sq => {
        sq.classList.remove('selected', 'valid-move');
    });
}

// Highlight valid moves (simplified - server validates actual moves)
function highlightValidMoves(from) {
    clearHighlights();
    // In a full implementation, you'd calculate and highlight valid moves
    // For now, we'll let the server handle validation
}

// Clear highlights
function clearHighlights() {
    document.querySelectorAll('.square').forEach(square => {
        square.classList.remove('valid-move', 'selected');
    });
}

// Update turn indicator
function updateTurnIndicator() {
    const whitePlayer = document.getElementById('white-player-name');
    const blackPlayer = document.getElementById('black-player-name');
    
    if (whitePlayer && blackPlayer) {
        const currentTurnDisplay = document.getElementById('current-turn');
        
        whitePlayer.classList.remove('current-turn');
        blackPlayer.classList.remove('current-turn');
        
        if (currentTurn === 'w') {
            whitePlayer.classList.add('current-turn');
            if (currentTurnDisplay) currentTurnDisplay.textContent = 'White';
        } else {
            blackPlayer.classList.add('current-turn');
            if (currentTurnDisplay) currentTurnDisplay.textContent = 'Black';
        }
    }
}

// Update game status display
function updateGameStatus() {
    const statusElement = document.getElementById('game-status');
    const moveCountElement = document.getElementById('move-count');
    
    if (statusElement) {
        if (gameStats.inCheck) {
            statusElement.textContent = 'Check!';
            statusElement.className = 'status-indicator status-check';
        } else {
            statusElement.textContent = 'Normal';
            statusElement.className = 'status-indicator status-normal';
        }
    }
    
    if (moveCountElement) {
        moveCountElement.textContent = gameStats.moveCount;
    }
}

// Update captured pieces display
function updateCapturedPieces() {
    const capturedByWhite = document.getElementById('captured-by-white');
    const capturedByBlack = document.getElementById('captured-by-black');
    
    if (capturedByWhite) {
        capturedByWhite.innerHTML = '';
        gameStats.capturedPieces.white.forEach(piece => {
            const pieceElement = document.createElement('div');
            pieceElement.classList.add('captured-piece');
            pieceElement.textContent = pieces[piece];
            capturedByWhite.appendChild(pieceElement);
        });
    }
    
    if (capturedByBlack) {
        capturedByBlack.innerHTML = '';
        gameStats.capturedPieces.black.forEach(piece => {
            const pieceElement = document.createElement('div');
            pieceElement.classList.add('captured-piece');
            pieceElement.textContent = pieces[piece];
            capturedByBlack.appendChild(pieceElement);
        });
    }
}

// Update move history
function updateMoveHistory(move) {
    const moveHistory = document.getElementById('move-history');
    
    if (moveHistory) {
        if (gameStats.moveCount === 0) {
            moveHistory.innerHTML = '';
        }
        
        const moveItem = document.createElement('div');
        moveItem.classList.add('move-item');
        moveItem.textContent = `${Math.ceil(gameStats.moveCount / 2)}. ${move}`;
        moveHistory.appendChild(moveItem);
        
        // Scroll to bottom
        moveHistory.scrollTop = moveHistory.scrollHeight;
    }
}

// Update scores
function updateScores() {
    const whiteScore = document.getElementById('white-score');
    const blackScore = document.getElementById('black-score');
    
    if (whiteScore) whiteScore.textContent = gameStats.scores.white;
    if (blackScore) blackScore.textContent = gameStats.scores.black;
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.classList.add('notification', type);
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Show error message
function showError(message) {
    showNotification(message, 'error');
}

// Show success message
function showSuccess(message) {
    showNotification(message, 'success');
}

// Show info message
function showInfo(message) {
    showNotification(message, 'info');
}

// Show game over modal
function showGameOverModal(winner, reason) {
    const modal = document.createElement('div');
    modal.classList.add('modal-overlay');
    modal.innerHTML = `
        <div class="modal-content">
            <div class="celebration">${winner === 'draw' ? '🤝' : '🎉'}</div>
            <h2 class="text-2xl font-bold mb-4">
                ${winner === 'draw' ? 'Game Draw!' : `${winner === 'w' ? 'White' : 'Black'} Wins!`}
            </h2>
            <p class="text-gray-600 mb-4">${reason}</p>
            <button class="play-again-btn" onclick="location.reload()">
                Play Again
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

socket.on('playerRole', (role) => {
    playerRole = role;
    console.log('Assigned role:', role);
    isSpectator = false;
});

socket.on('gameId', (gameId) => {
    console.log('Game ID:', gameId);
    showGameIdDisplay(gameId);
});


socket.on('playerNames', (players) => {
    const whitePlayerElement = document.getElementById('white-player-name');
    const blackPlayerElement = document.getElementById('black-player-name');
    
    if (whitePlayerElement) {
        const nameSpan = whitePlayerElement.querySelector('span.truncate') || whitePlayerElement.querySelector('span') || whitePlayerElement;
        nameSpan.textContent = players.white;
    }
    
    if (blackPlayerElement) {
        const nameSpan = blackPlayerElement.querySelector('span.truncate') || blackPlayerElement.querySelector('span') || blackPlayerElement;
        nameSpan.textContent = players.black;
    }
});

socket.on('gameReady', () => {
    hideLoadingOverlay();
    gameActive = true;
    showSuccess('Game started! Both players connected.');
});

socket.on('boardState', (fen) => {
    updateBoard(fen);
});

socket.on('gameStats', (stats) => {
    gameStats.moveCount = stats.moveCount;
    gameStats.capturedPieces = stats.capturedPieces;
    gameStats.inCheck = stats.inCheck;
    gameStats.scores = stats.scores;
    currentTurn = stats.currentTurn;
    
    updateGameStatus();
    updateCapturedPieces();
    updateScores();
    updateTurnIndicator();
});

socket.on('move', (data) => {
    gameStats.moveCount++;
    
    if (data.captured) {
        const capturedPiece = data.captured;
        const capturedBy = currentTurn === 'w' ? 'black' : 'white';
        gameStats.capturedPieces[capturedBy].push(capturedPiece);
    }
    
    updateCapturedPieces();
    updateMoveHistory(data.san);
    highlightLastMove(data);
});

socket.on('invalidMove', (data) => {
    showError(data.reason || 'Invalid move');
    clearSelection();
});

socket.on('gameOver', (data) => {
    gameActive = false;
    showGameOverModal(data.winner, data.reason);
    
    // Update scores
    gameStats.scores = data.scores;
    updateScores();
});

socket.on('playerDisconnected', (data) => {
    gameActive = false;
    showError(`${data.playerName} disconnected`);
    showLoadingOverlay();
});

socket.on('resetGame', () => {
    // Reset board to starting position
    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    updateBoard(startingFen);
    
    gameStats.moveCount = 0;
    gameStats.inCheck = false;
    
    updateGameStatus();
    
    const moveHistory = document.getElementById('move-history');
    if (moveHistory) {
        moveHistory.innerHTML = '';
    }
    
    clearSelection();
    clearHighlights();
});

socket.on('scoresUpdate', (scores) => {
    gameStats.scores = scores;
    updateScores();
});

socket.on('check', (data) => {
    gameStats.inCheck = true;
    updateGameStatus();
    showInfo(`${data.player === 'w' ? 'White' : 'Black'} is in check!`);
});

socket.on('pieceCaptured', (data) => {
    // Handle piece capture animation/sound if needed
    console.log('Piece captured:', data.piece);
});

socket.on('error', (message) => {
    showError(message);
});

socket.on('connect', () => {
    showSuccess('Connected to server');
});

socket.on('disconnect', () => {
    showError('Disconnected from server');
    gameActive = false;
});

socket.on('reconnect', () => {
    showSuccess('Reconnected to server');
    // Request current game state
    socket.emit('getBoardState');
});

// Highlight last move
function highlightLastMove(move) {
    clearHighlights();
    
    const fromSquare = document.querySelector(`[data-square="${move.from}"]`);
    const toSquare = document.querySelector(`[data-square="${move.to}"]`);
    
    if (fromSquare) fromSquare.classList.add('last-move');
    if (toSquare) toSquare.classList.add('last-move');
}

// Highlight king in check
function highlightKingInCheck(kingSquare) {
    const square = document.querySelector(`[data-square="${kingSquare}"]`);
    if (square) {
        square.classList.add('check');
    }
}

// Initialize starting position
const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
updateBoard(startingFen);

// Handle window resize for responsive design
window.addEventListener('resize', function() {
    // Adjust board size if needed
    const board = document.querySelector('.chessboard');
    if (board) {
        // Force recalculation of board dimensions
        board.style.width = '';
        board.style.height = '';
    }
});

// Handle visibility change (tab switching)
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && gameActive) {
        // Refresh game state when tab becomes visible
        socket.emit('getBoardState');
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        clearSelection();
    }
});

// Touch device support
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
});

document.addEventListener('touchmove', function(e) {
    e.preventDefault(); // Prevent scrolling
});

// Prevent context menu on long press
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

// Performance optimization: debounce resize events
let resizeTimeout;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
        // Recalculate board dimensions
        const board = document.querySelector('.chessboard');
        if (board) {
            board.style.width = '';
            board.style.height = '';
        }
    }, 250);
});

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (socket.connected) {
        socket.disconnect();
    }
});