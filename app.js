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
    white: { id: null, name: null },
    black: { id: null, name: null }
};
let currentPlayer = 'w';

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.render('index', { title: 'Chess' });
});

io.on("connection", (uniquesocket) => {
    console.log('A user connected:', uniquesocket.id);

    uniquesocket.on('playerRegistered', (name) => {
        if (!players.white.id) {
            players.white = { id: uniquesocket.id, name: name };
            uniquesocket.emit("playerRole", "w");
            
            io.emit("playerNames", {
                white: name,
                black: players.black.name || "Waiting..."
            });
        } else if (!players.black.id) {
            players.black = { id: uniquesocket.id, name: name };
            uniquesocket.emit("playerRole", "b");
            
            io.emit("playerNames", {
                white: players.white.name,
                black: name
            });
            
            io.emit("gameReady");
        } else {
            uniquesocket.emit("spectatorRole");
        }

        uniquesocket.emit("boardState", chess.fen());
    });

    uniquesocket.on("disconnect", () => {
        if (players.white.id === uniquesocket.id) {
            players.white = { id: null, name: null };
        }
        if (players.black.id === uniquesocket.id) {
            players.black = { id: null, name: null };
        }

        io.emit("playerNames", {
            white: players.white.name || "Waiting...",
            black: players.black.name || "Waiting..."
        });

        io.emit("playerDisconnected");
        chess.reset();
        io.emit("resetGame");
        console.log("A player disconnected. Resetting game...");
    });

    uniquesocket.on("move", (move) => {
        try {
            if (chess.turn() === "w" && uniquesocket.id !== players.white.id) return;
            if (chess.turn() === "b" && uniquesocket.id !== players.black.id) return;

            if (players.white.id && players.black.id) {
                io.emit("move", move);
            }

            const result = chess.move(move);
            if (result) {
                currentPlayer = chess.turn();
                io.emit("boardState", chess.fen());
            } else {
                uniquesocket.emit("invalidMove");
                console.log("Invalid move attempted:", move);
            }
        } catch (e) {
            console.log("Move error:", e);
            uniquesocket.emit("invalidMove", move);
        }
    });

    uniquesocket.on("getBoardState", () => {
        uniquesocket.emit("boardState", chess.fen());
    });
});

server.listen(3000, () => {
    console.log('Server is running on port 3000');
});