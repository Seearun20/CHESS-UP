const express = require('express');
const socket = require('socket.io');
const http = require('http');
const path = require('path');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);
const io = socket(server);
const chess = new Chess();
let players = {}; // Stores player sockets
let currentPlayer = 'w';

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.render('index', { title: 'Chess' });
});

io.on("connection", (uniquesocket) => {
    console.log('A user connected:', uniquesocket.id);

    // Assign white and black players
    if (!players.white) {
        players.white = uniquesocket.id;
        uniquesocket.emit("playerRole", "w");
    } else if (!players.black) {
        players.black = uniquesocket.id;
        uniquesocket.emit("playerRole", "b");
    } else {
        uniquesocket.emit("spectatorRole");
    }

    // Send initial board state
    uniquesocket.emit("boardState", chess.fen());

    uniquesocket.on("disconnect", () => {
        console.log('User disconnected:', uniquesocket.id);
        if (uniquesocket.id === players.white) {
            delete players.white;
        } else if (uniquesocket.id === players.black) {
            delete players.black;
        }
    });

    uniquesocket.on("move", (move) => {
        try {
            // ✅ Fixed: Correct turn validation
            if (chess.turn() === "w" && uniquesocket.id !== players.white) return;
            if (chess.turn() === "b" && uniquesocket.id !== players.black) return;

            const result = chess.move(move);
            if (result) {
                currentPlayer = chess.turn();
                io.emit("boardState", chess.fen()); // ✅ Correct: Broadcast new board state
            } else {
                uniquesocket.emit("invalidMove");
                console.log("Invalid move attempted:", move);
            }
        } catch (e) {
            console.log("Move error:", e);
            uniquesocket.emit("invalidMove", move);
        }
    });
});

server.listen(3000, () => {
    console.log('Server is running on port 3000');
});
