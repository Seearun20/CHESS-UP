const express = require('express');
const http = require('http');
const { Server } = require("socket.io"); // Import `Server` from socket.io
const path = require('path');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);

// ✅ Fix: WebSockets CORS settings for deployment
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const chess = new Chess();
let players = {}; // Stores player sockets
let currentPlayer = 'w';

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.render('index', { title: 'Chess' });
});

io.on("connection", (socket) => {
    console.log('A user connected:', socket.id);

    // Assign white and black players
    if (!players.white) {
        players.white = socket.id;
        socket.emit("playerRole", "w");
    } else if (!players.black) {
        players.black = socket.id;
        socket.emit("playerRole", "b");
    } else {
        socket.emit("spectatorRole");
    }

    // Send initial board state
    socket.emit("boardState", chess.fen());

    socket.on("disconnect", () => {
        console.log('User disconnected:', socket.id);
        if (socket.id === players.white) {
            delete players.white;
        } else if (socket.id === players.black) {
            delete players.black;
        }
        io.emit("boardState", chess.fen()); // ✅ Refresh board on disconnect
    });

    socket.on("move", (move) => {
        try {
            // ✅ Fixed: Correct turn validation
            if (chess.turn() === "w" && socket.id !== players.white) return;
            if (chess.turn() === "b" && socket.id !== players.black) return;

            const result = chess.move(move);
            if (result) {
                currentPlayer = chess.turn();
                io.emit("boardState", chess.fen()); // ✅ Correct: Broadcast new board state
            } else {
                socket.emit("invalidMove");
                console.log("Invalid move attempted:", move);
            }
        } catch (e) {
            console.log("Move error:", e);
            socket.emit("invalidMove", move);
        }
    });
});

// ✅ Fix: Use `process.env.PORT` for Vercel
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
