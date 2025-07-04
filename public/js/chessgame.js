// Chess game client-side logic with multi-game support
const socket = io();

let draggedElement = null;
let draggedFrom = null;
let playerRole = null;
let gameActive = false;
let currentTurn = 'w';
let currentGameId = null;
let availableGames = [];

// Chess piece symbols
const pieces = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
};

// Initialize the game
document.addEventListener('DOMContentLoaded', function() {
    showNameModal();
    createBoard();
    setupEventListeners();
});

// Show name input modal with game selection
function showNameModal() {
    const modal = document.getElementById('name-modal') || createNameModal();
    modal.style.display = 'flex';
}

// Create name modal with game selection options
function createNameModal() {
    const modal = document.createElement('div');
    modal.id = 'name-modal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h2>🏆 Welcome to A-RunChess</h2>
            <div class="form-group">
                <label for="player-name">Enter your name:</label>
                <input type="text" id="player-name" placeholder="Your name" maxlength="20">
            </div>
            
            <div class="game-options">
                <h3>Choose an option:</h3>
                
                <div class="option-card" id="new-game-option">
                    <div class="option-icon">🆕</div>
                    <h4>Start New Game</h4>
                    <p>Create a new game or join a waiting room</p>
                    <button id="new-game-btn" class="option-btn">Start Playing</button>
                </div>
                
                <div class="option-card" id="spectate-option">
                    <div class="option-icon">👀</div>
                    <h4>Spectate Game</h4>
                    <p>Watch an ongoing game</p>
                    <div id="games-list">
                        <p class="loading">Loading available games...</p>
                    </div>
                    <div class="spectate-input" style="display: none;">
                        <input type="number" id="game-id-input" placeholder="Enter Game ID">
                        <button id="spectate-btn" class="option-btn">Spectate</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add styles
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;
    
    document.body.appendChild(modal);
    return modal;
}

// Setup event listeners
function setupEventListeners() {
    document.addEventListener('click', function(e) {
        if (e.target.id === 'new-game-btn') {
            handleNewGame();
        } else if (e.target.id === 'spectate-btn') {
            handleSpectateGame();
        } else if (e.target.classList.contains('game-item')) {
            selectGameToSpectate(e.target.dataset.gameId);
        }
    });

    document.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const activeElement = document.activeElement;
            if (activeElement.id === 'player-name') {
                document.getElementById('new-game-btn').click();
            } else if (activeElement.id === 'game-id-input') {
                document.getElementById('spectate-btn').click();
            }
        }
    });
}

// Handle new game creation
function handleNewGame() {
    const name = document.getElementById('player-name').value.trim();
    if (!name) {
        showError('Please enter your name');
        return;
    }
    
    socket.emit('playerRegistered', {
        name: name,
        action: 'newGame'
    });
    
    document.getElementById('name-modal').style.display = 'none';
    showLoadingOverlay();
}

// Handle spectate game
function handleSpectateGame() {
    const name = document.getElementById('player-name').value.trim();
    const gameId = document.getElementById('game-id-input').value.trim();
    
    if (!name) {
        showError('Please enter your name');
        return;
    }
    
    if (!gameId) {
        showError('Please enter a Game ID');
        return;
    }
    
    socket.emit('playerRegistered', {
        name: name,
        action: 'spectate',
        gameId: parseInt(gameId)
    });
    
    document.getElementById('name-modal').style.display = 'none';
    showLoadingOverlay();
}

// Select game to spectate from list
function selectGameToSpectate(gameId) {
    document.getElementById('game-id-input').value = gameId;
    const name = document.getElementById('player-name').value.trim();
    
    if (!name) {
        showError('Please enter your name first');
        return;
    }
    
    socket.emit('playerRegistered', {
        name: name,
        action: 'spectate',
        gameId: parseInt(gameId)
    });
    
    document.getElementById('name-modal').style.display = 'none';
    showLoadingOverlay();
}

// Update available games list
function updateAvailableGames(games) {
    availableGames = games;
    const gamesList = document.getElementById('games-list');
    
    if (!gamesList) return;
    
    if (games.length === 0) {
        gamesList.innerHTML = '<p class="no-games">No games available for spectating</p>';
        document.querySelector('.spectate-input').style.display = 'block';
        return;
    }
    
    gamesList.innerHTML = '<h5>Available Games:</h5>';
    games.forEach(game => {
        const gameItem = document.createElement('div');
        gameItem.className = 'game-item';
        gameItem.dataset.gameId = game.gameId;
        
        const status = game.gameInProgress ? '🟢 In Progress' : '🟡 Waiting';
        const players = `${game.players.white || 'Waiting'} vs ${game.players.black || 'Waiting'}`;
        const spectators = game.spectatorCount > 0 ? ` (${game.spectatorCount} watching)` : '';
        
        gameItem.innerHTML = `
            <div class="game-info">
                <strong>Game #${game.gameId}</strong>
                <div class="game-status">${status}</div>
                <div class="game-players">${players}</div>
                <div class="game-details">Moves: ${game.moveCount}${spectators}</div>
            </div>
        `;
        
        gamesList.appendChild(gameItem);
    });
    
    document.querySelector('.spectate-input').style.display = 'block';
}

// Show loading overlay
function showLoadingOverlay() {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="spinner"></div>
                <h3>Connecting to game...</h3>
                <p id="loading-status">Please wait</p>
                <div id="game-info" style="display: none;">
                    <p>Game ID: <span id="current-game-id">-</span></p>
                    <p>Role: <span id="current-role">-</span></p>
                </div>
            </div>
        `;
        
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
            color: white;
            text-align: center;
        `;
        
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
}

// Hide loading overlay
function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Update loading status
function updateLoadingStatus(status, gameId = null, role = null) {
    const statusElement = document.getElementById('loading-status');
    const gameInfoElement = document.getElementById('game-info');
    const gameIdElement = document.getElementById('current-game-id');
    const roleElement = document.getElementById('current-role');
    
    if (statusElement) statusElement.textContent = status;
    
    if (gameId && role) {
        if (gameIdElement) gameIdElement.textContent = gameId;
        if (roleElement) roleElement.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        if (gameInfoElement) gameInfoElement.style.display = 'block';
    }
}

// Create the chessboard
function createBoard() {
    const board = document.querySelector('.chessboard');
    if (!board) return;
    
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
    if (!board) return;
    
    const squares = board.querySelectorAll('.square');
    
    // Parse FEN to get piece positions
    const position = fen.split(' ')[0];
    const rows = position.split('/');
    
    // Clear all pieces
    squares.forEach(square => {
        square.innerHTML = '';
        square.classList.remove('piece');
        square.removeAttribute('draggable');
    });
    
    // Place pieces according to FEN
    let squareIndex = 0;
    for (let row = 0; row < 8; row++) {
        const rowData = rows[row];
        let col = 0;
        
        for (let char of rowData) {
            if (isNaN(char)) {
                // It's a piece
                const square = squares[squareIndex];
                const piece = document.createElement('div');
                piece.className = 'piece';
                piece.textContent = pieces[char];
                piece.dataset.piece = char;
                
                // Make piece draggable if it's the player's piece and their turn
                if (canMovePiece(char)) {
                    piece.draggable = true;
                    piece.addEventListener('dragstart', handleDragStart);
                    square.classList.add('draggable');
                }
                
                square.appendChild(piece);
                square.classList.add('piece');
                col++;
                squareIndex++;
            } else {
                // It's a number indicating empty squares
                const emptySquares = parseInt(char);
                for (let i = 0; i < emptySquares; i++) {
                    col++;
                    squareIndex++;
                }
            }
        }
    }
    
    // Update current turn
    currentTurn = fen.split(' ')[1];
    updateTurnIndicator();
}

// Check if player can move a piece
function canMovePiece(piece) {
    if (playerRole === 'spectator') return false;
    if (!gameActive) return false;
    
    const isWhitePiece = piece === piece.toUpperCase();
    const isPlayersTurn = (playerRole === 'w' && currentTurn === 'w') || 
                         (playerRole === 'b' && currentTurn === 'b');
    const isPlayersPiece = (playerRole === 'w' && isWhitePiece) || 
                          (playerRole === 'b' && !isWhitePiece);
    
    return isPlayersTurn && isPlayersPiece;
}

// Handle drag start
function handleDragStart(e) {
    if (!canMovePiece(e.target.dataset.piece)) {
        e.preventDefault();
        return;
    }
    
    draggedElement = e.target;
    draggedFrom = e.target.parentElement.dataset.square;
    e.target.style.opacity = '0.5';
    
    // Highlight possible moves
    highlightPossibleMoves(draggedFrom);
}

// Handle drag over
function handleDragOver(e) {
    e.preventDefault();
}

// Handle drop
function handleDrop(e) {
    e.preventDefault();
    
    if (!draggedElement) return;
    
    const targetSquare = e.currentTarget.dataset.square;
    const fromSquare = draggedFrom;
    
    // Reset opacity
    draggedElement.style.opacity = '1';
    
    // Clear highlights
    clearHighlights();
    
    // Try to make the move
    if (fromSquare !== targetSquare) {
        makeMove(fromSquare, targetSquare);
    }
    
    draggedElement = null;
    draggedFrom = null;
}

// Handle square click (for mobile/touch devices)
let selectedSquare = null;

function handleSquareClick(e) {
    const square = e.currentTarget;
    const squareNotation = square.dataset.square;
    
    if (selectedSquare) {
        // Second click - try to move
        if (selectedSquare !== squareNotation) {
            makeMove(selectedSquare, squareNotation);
        }
        clearSelection();
    } else {
        // First click - select piece
        const piece = square.querySelector('.piece');
        if (piece && canMovePiece(piece.dataset.piece)) {
            selectedSquare = squareNotation;
            square.classList.add('selected');
            highlightPossibleMoves(squareNotation);
        }
    }
}

// Clear selection
function clearSelection() {
    selectedSquare = null;
    document.querySelectorAll('.square.selected').forEach(sq => {
        sq.classList.remove('selected');
    });
    clearHighlights();
}

// Make a move
function makeMove(from, to) {
    // Check for pawn promotion
    const piece = document.querySelector(`[data-square="${from}"] .piece`);
    if (!piece) return;
    
    const pieceType = piece.dataset.piece.toLowerCase();
    const isPromotion = pieceType === 'p' && 
                       ((to[1] === '8' && playerRole === 'w') || 
                        (to[1] === '1' && playerRole === 'b'));
    
    let move = { from, to };
    
    if (isPromotion) {
        // Show promotion dialog
        showPromotionDialog(from, to);
        return;
    }
    
    // Send move to server
    socket.emit('move', move);
}

// Show promotion dialog
function showPromotionDialog(from, to) {
    const modal = document.createElement('div');
    modal.className = 'promotion-modal';
    modal.innerHTML = `
        <div class="promotion-content">
            <h3>Choose promotion piece:</h3>
            <div class="promotion-pieces">
                <button class="promotion-btn" data-piece="q">${playerRole === 'w' ? '♕' : '♛'}</button>
                <button class="promotion-btn" data-piece="r">${playerRole === 'w' ? '♖' : '♜'}</button>
                <button class="promotion-btn" data-piece="b">${playerRole === 'w' ? '♗' : '♝'}</button>
                <button class="promotion-btn" data-piece="n">${playerRole === 'w' ? '♘' : '♞'}</button>
            </div>
        </div>
    `;
    
    modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('promotion-btn')) {
            const promotion = e.target.dataset.piece;
            socket.emit('move', { from, to, promotion });
            document.body.removeChild(modal);
        }
    });
    
    document.body.appendChild(modal);
}

// Highlight possible moves (basic implementation)
function highlightPossibleMoves(square) {
    // This is a simplified version - in a full implementation,
    // you'd calculate legal moves based on piece type and board state
    clearHighlights();
    
    const squares = document.querySelectorAll('.square');
    squares.forEach(sq => {
        if (sq.dataset.square !== square) {
            sq.classList.add('possible-move');
        }
    });
}

// Clear move highlights
function clearHighlights() {
    document.querySelectorAll('.square').forEach(square => {
        square.classList.remove('possible-move', 'check', 'last-move');
    });
}

// Update turn indicator
function updateTurnIndicator() {
    const turnElement = document.querySelector('.turn-indicator');
    if (!turnElement) return;
    
    const currentPlayer = currentTurn === 'w' ? 'White' : 'Black';
    const isYourTurn = (playerRole === 'w' && currentTurn === 'w') || 
                      (playerRole === 'b' && currentTurn === 'b');
    
    if (playerRole === 'spectator') {
        turnElement.textContent = `${currentPlayer}'s turn`;
        turnElement.className = 'turn-indicator spectator';
    } else {
        turnElement.textContent = isYourTurn ? 'Your turn!' : `${currentPlayer}'s turn`;
        turnElement.className = `turn-indicator ${isYourTurn ? 'your-turn' : 'opponent-turn'}`;
    }
}

// Show error message
function showError(message) {
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ff4444;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 3000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        if (errorDiv.parentElement) {
            errorDiv.remove();
        }
    }, 3000);
}

// Show success message
function showSuccess(message) {
    const existingSuccess = document.querySelector('.success-message');
    if (existingSuccess) {
        existingSuccess.remove();
    }
    
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #44ff44;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 3000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        if (successDiv.parentElement) {
            successDiv.remove();
        }
    }, 3000);
}

// Play move sound
function playMoveSound(captured = false) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Set sound properties
        oscillator.frequency.setValueAtTime(captured ? 800 : 600, audioContext.currentTime);
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
        // Audio context not supported, silently fail
        console.log('Audio not supported');
    }
}

// Socket event handlers
socket.on('playerRole', (role) => {
    playerRole = role;
    updateLoadingStatus('Connected as player', currentGameId, role === 'w' ? 'White' : 'Black');
    setTimeout(hideLoadingOverlay, 1000);
});

socket.on('spectatorRole', () => {
    playerRole = 'spectator';
    updateLoadingStatus('Connected as spectator', currentGameId, 'Spectator');
    setTimeout(hideLoadingOverlay, 1000);
});

socket.on('gameId', (gameId) => {
    currentGameId = gameId;
    document.title = `A-RunChess - Game #${gameId}`;
});

socket.on('boardState', (fen) => {
    updateBoard(fen);
});

socket.on('gameReady', () => {
    gameActive = true;
    showSuccess('Game started! Good luck!');
});

socket.on('resetGame', () => {
    gameActive = false;
    currentTurn = 'w';
    updateBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    clearSelection();
});

socket.on('playerNames', (names) => {
    const whiteNameElement = document.querySelector('.white-player-name');
    const blackNameElement = document.querySelector('.black-player-name');
    
    if (whiteNameElement) whiteNameElement.textContent = names.white;
    if (blackNameElement) blackNameElement.textContent = names.black;
});

socket.on('gameStats', (stats) => {
    // Update move count
    const moveCountElement = document.querySelector('.move-count');
    if (moveCountElement) {
        moveCountElement.textContent = stats.moveCount;
    }
    
    // Update scores
    const whiteScoreElement = document.querySelector('.white-score');
    const blackScoreElement = document.querySelector('.black-score');
    if (whiteScoreElement) whiteScoreElement.textContent = stats.scores.white;
    if (blackScoreElement) blackScoreElement.textContent = stats.scores.black;
    
    // Update captured pieces
    updateCapturedPieces(stats.capturedPieces);
    
    // Update turn
    currentTurn = stats.currentTurn;
    updateTurnIndicator();
    
    // Show check indicator
    if (stats.inCheck) {
        showCheck(stats.currentTurn);
    }
});

socket.on('move', (moveData) => {
    // Highlight the last move
    clearHighlights();
    const fromSquare = document.querySelector(`[data-square="${moveData.from}"]`);
    const toSquare = document.querySelector(`[data-square="${moveData.to}"]`);
    
    if (fromSquare) fromSquare.classList.add('last-move');
    if (toSquare) toSquare.classList.add('last-move');
    
    // Play move sound (if available)
    playMoveSound(moveData.captured);
});

socket.on('invalidMove', (data) => {
    showError(data.reason);
    clearSelection();
});

socket.on('check', (data) => {
    showCheck(data.player);
});

socket.on('gameOver', (data) => {
    gameActive = false;
    showGameOverDialog(data);
});

socket.on('playerDisconnected', (data) => {
    showError(`${data.playerName} disconnected. Game reset.`);
    gameActive = false;
});

socket.on('availableGames', (games) => {
    updateAvailableGames(games);
});

socket.on('scoresUpdate', (scores) => {
    const whiteScoreElement = document.querySelector('.white-score');
    const blackScoreElement = document.querySelector('.black-score');
    if (whiteScoreElement) whiteScoreElement.textContent = scores.white;
    if (blackScoreElement) blackScoreElement.textContent = scores.black;
});

socket.on('pieceCaptured', (data) => {
    // Handle piece capture animation/sound
    playMoveSound(true);
});

// Update captured pieces display
function updateCapturedPieces(capturedPieces) {
    const whiteCapturedElement = document.querySelector('.white-captured');
    const blackCapturedElement = document.querySelector('.black-captured');
    
    if (whiteCapturedElement) {
        whiteCapturedElement.innerHTML = capturedPieces.white.map(piece => pieces[piece]).join(' ');
    }
    
    if (blackCapturedElement) {
        blackCapturedElement.innerHTML = capturedPieces.black.map(piece => pieces[piece]).join(' ');
    }
}

// Show check indicator
function showCheck(player) {
    const checkElement = document.querySelector('.check-indicator');
    if (checkElement) {
        checkElement.textContent = `${player === 'w' ? 'White' : 'Black'} is in check!`;
        checkElement.style.display = 'block';
        
        setTimeout(() => {
            checkElement.style.display = 'none';
        }, 3000);
    }
}

// Show game over dialog
function showGameOverDialog(data) {
    const modal = document.createElement('div');
    modal.className = 'game-over-modal';
    
    let winnerText = '';
    if (data.winner === 'draw') {
        winnerText = 'Game ended in a draw!';
    } else {
        const winnerName = data.winner === 'w' ? 'White' : 'Black';
        winnerText = `${winnerName} wins!`;
    }
    
    modal.innerHTML = `
        <div class="game-over-content">
            <h2>Game Over</h2>
            <h3>${winnerText}</h3>
            <p>${data.reason}</p>
            <div class="final-scores">
                <p>Final Scores:</p>
                <p>White: ${data.scores.white} | Black: ${data.scores.black}</p>
            </div>
            <div class="game-stats">
                <p>Game Length: ${data.gameLength} moves</p>
                <p>Duration: ${Math.floor(data.gameDuration / 60)}:${(data.gameDuration % 60).toString().padStart(2, '0')}</p>
            </div>
            <p>Game will reset in 5 seconds...</p>
        </div>
    `;
    
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 4000;
        color: white;
        text-align: center;
    `;
    
    document.body.appendChild(modal);
    
    setTimeout(() => {
        if (modal.parentElement) {
            modal.remove();
        }
    }, 5000);
}

// Additional utility functions for enhanced functionality

// Request fresh game list
function refreshAvailableGames() {
    socket.emit('getAvailableGames');
}

// Get current board state from server
function requestBoardState() {
    socket.emit('getBoardState');
}

// Get detailed game statistics
function requestGameStats() {
    socket.emit('getGameStats');
}

// Reset scores (if authorized)
function resetScores() {
    if (confirm('Are you sure you want to reset the scores?')) {
        socket.emit('resetScores');
    }
}

// Add keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Escape key to close modals/clear selection
    if (e.key === 'Escape') {
        clearSelection();
        
        // Close any open modals
        const modals = document.querySelectorAll('.promotion-modal, .game-over-modal');
        modals.forEach(modal => {
            if (modal.parentElement) {
                modal.remove();
            }
        });
    }
    
    // R key to refresh available games
    if (e.key === 'r' || e.key === 'R') {
        if (document.getElementById('name-modal').style.display === 'flex') {
            refreshAvailableGames();
        }
    }
});

// Auto-refresh available games every 30 seconds
setInterval(() => {
    if (document.getElementById('name-modal') && document.getElementById('name-modal').style.display === 'flex') {
        refreshAvailableGames();
    }
}, 30000);

// Handle connection errors
socket.on('connect_error', (error) => {
    showError('Connection failed. Please check your internet connection.');
    console.error('Socket connection error:', error);
});

socket.on('connect_failed', (error) => {
    showError('Connection failed. Please check your internet connection.');
    console.error('Socket connection error:', error);
});

socket.on('playerDisconnected', function() {
    gameActive = false;
    showError('Your opponent has disconnected');
    showLoadingOverlay();
});

socket.on('resetGame', function() {
    gameActive = false;
    clearSelection();
    createBoard();
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    
    @keyframes bounceIn {
        0% { transform: scale(0.3); opacity: 0; }
        50% { transform: scale(1.05); }
        70% { transform: scale(0.9); }
        100% { transform: scale(1); opacity: 1; }
    }
    
    @keyframes bounce {
        0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-10px); }
        60% { transform: translateY(-5px); }
    }
    
    .current-turn {
        box-shadow: 0 0 20px rgba(255, 215, 0, 0.8);
        border: 2px solid gold;
    }
    
    .square.selected {
        box-shadow: inset 0 0 0 3px #4CAF50;
    }
    
    .square.valid-move {
        background-color: rgba(76, 175, 80, 0.3) !important;
    }
    
    .square.last-move {
        background-color: rgba(255, 235, 59, 0.5) !important;
    }
`;
document.head.appendChild(style);
