// Chess game client-side logic
const socket = io();

let draggedElement = null;
let draggedFrom = null;
let playerRole = null;
let gameActive = false;
let currentTurn = 'w';

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

// Show name input modal
function showNameModal() {
    document.getElementById('name-modal').style.display = 'flex';
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('submit-name').addEventListener('click', function() {
        const name = document.getElementById('player-name').value.trim();
        if (name) {
            socket.emit('playerRegistered', name);
            document.getElementById('name-modal').style.display = 'none';
            showLoadingOverlay();
        } else {
            showError('Please enter your name');
        }
    });

    document.getElementById('player-name').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('submit-name').click();
        }
    });
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
        square.classList.remove('selected', 'valid-move', 'last-move');
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

// Clear selection
function clearSelection() {
    selectedSquare = null;
    document.querySelectorAll('.square').forEach(sq => {
        sq.classList.remove('selected', 'valid-move');
    });
}

// Highlight valid moves (simplified - you might want to implement proper move validation)
function highlightValidMoves(from) {
    // This is a simplified version - in a real implementation,
    // you'd calculate valid moves based on the piece type and board state
    clearHighlights();
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
    
    whitePlayer.classList.remove('current-turn');
    blackPlayer.classList.remove('current-turn');
    
    if (currentTurn === 'w') {
        whitePlayer.classList.add('current-turn');
    } else {
        blackPlayer.classList.add('current-turn');
    }
}

// Show error message
function showError(message) {
    createNotification(message, 'error');
}

// Show success message
function showSuccess(message) {
    createNotification(message, 'success');
}

// Show info message
function showInfo(message) {
    createNotification(message, 'info');
}

// Create notification
function createNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    
    switch(type) {
        case 'error':
            notification.style.background = 'linear-gradient(135deg, #ff6b6b, #ee5a52)';
            break;
        case 'success':
            notification.style.background = 'linear-gradient(135deg, #51cf66, #40c057)';
            break;
        case 'info':
            notification.style.background = 'linear-gradient(135deg, #339af0, #228be6)';
            break;
    }
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Show game over modal
function showGameOver(winner, reason) {
    const modal = document.createElement('div');
    modal.className = 'game-over-modal';
    modal.innerHTML = `
        <div class="game-over-content">
            <div class="celebration">🎉</div>
            <h2>${winner === playerRole ? 'Congratulations!' : 'Game Over'}</h2>
            <p>${winner === 'w' ? 'White' : 'Black'} wins!</p>
            <p class="reason">${reason}</p>
            <button onclick="location.reload()" class="play-again-btn">Play Again</button>
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
        z-index: 2000;
        animation: fadeIn 0.5s ease-out;
    `;
    
    const content = modal.querySelector('.game-over-content');
    content.style.cssText = `
        background: white;
        padding: 40px;
        border-radius: 20px;
        text-align: center;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        animation: bounceIn 0.5s ease-out;
    `;
    
    const celebration = modal.querySelector('.celebration');
    celebration.style.cssText = `
        font-size: 60px;
        margin-bottom: 20px;
        animation: bounce 1s infinite;
    `;
    
    const playAgainBtn = modal.querySelector('.play-again-btn');
    playAgainBtn.style.cssText = `
        background: linear-gradient(135deg, #4CAF50, #45a049);
        color: white;
        border: none;
        padding: 12px 30px;
        border-radius: 25px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        margin-top: 20px;
        transition: transform 0.2s ease;
    `;
    
    playAgainBtn.addEventListener('mouseover', () => {
        playAgainBtn.style.transform = 'scale(1.05)';
    });
    
    playAgainBtn.addEventListener('mouseout', () => {
        playAgainBtn.style.transform = 'scale(1)';
    });
    
    document.body.appendChild(modal);
    
    // Play celebration sound (if available)
    if (winner === playerRole) {
        playSound('victory');
    } else {
        playSound('defeat');
    }
}

// Play sound (placeholder - you can add actual sound files)
function playSound(type) {
    // You can implement actual sound playing here
    console.log(`Playing ${type} sound`);
}

// Socket event listeners
socket.on('playerRole', function(role) {
    playerRole = role;
    console.log('Player role:', role);
});

socket.on('spectatorRole', function() {
    showInfo('You are now spectating the game');
});

socket.on('playerNames', function(names) {
    document.getElementById('white-player-name').textContent = names.white;
    document.getElementById('black-player-name').textContent = names.black;
});

socket.on('gameReady', function() {
    hideLoadingOverlay();
    gameActive = true;
    showSuccess('Game started! Good luck!');
});

socket.on('boardState', function(fen) {
    updateBoard(fen);
});

socket.on('move', function(move) {
    showInfo(`Move: ${move.from} to ${move.to}`);
});

socket.on('invalidMove', function() {
    showError('Invalid move! Please try again.');
});

socket.on('gameOver', function(data) {
    gameActive = false;
    showGameOver(data.winner, data.reason);
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
