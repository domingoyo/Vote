const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
// Serve sound files from 'sound' directory
app.use('/sound', express.static(path.join(__dirname, 'sound')));
// Serve video files from 'video' directory
app.use('/video', express.static(path.join(__dirname, 'video')));

// Game State
let gameState = {
    step: 'WAITING', // WAITING, VOTING, LOCKED, REVEALED
    connectedUsers: 0,
    votes: {
        yes: 0,
        no: 0
    }
};

// Helper: Broadcast state to admin
function broadcastStats() {
    io.emit('stats', {
        connected: gameState.connectedUsers,
        yes: gameState.votes.yes,
        no: gameState.votes.no,
        step: gameState.step
    });
}

io.on('connection', (socket) => {
    const role = socket.handshake.query.role;

    // Only count voters (users without specific roles or implicit voters)
    if (role !== 'admin' && role !== 'display') {
        gameState.connectedUsers++;
    }

    // Send current state to new user
    socket.emit('state-change', gameState.step);
    broadcastStats();

    console.log(`User connected [${role || 'voter'}]: ${socket.id}`);

    socket.on('disconnect', () => {
        if (role !== 'admin' && role !== 'display') {
            gameState.connectedUsers--;
            if (gameState.connectedUsers < 0) gameState.connectedUsers = 0;
        }
        broadcastStats();
        console.log(`User disconnected [${role || 'voter'}]: ${socket.id}`);
    });

    // User Voting
    socket.on('vote', (vote) => {
        if (gameState.step === 'VOTING') {
            if (vote === 'yes') gameState.votes.yes++;
            if (vote === 'no') gameState.votes.no++;
            broadcastStats();
        }
    });

    // Admin Controls
    socket.on('admin:start', () => {
        gameState.step = 'VOTING';
        io.emit('state-change', 'VOTING');
        broadcastStats();
    });

    socket.on('admin:lock', () => {
        gameState.step = 'LOCKED';
        io.emit('state-change', 'LOCKED');
        broadcastStats();
    });

    socket.on('admin:reveal', () => {
        gameState.step = 'REVEALED';
        const result = gameState.votes.yes > gameState.votes.no ? 'pass' : 'fail';
        io.emit('reveal', { result }); // Client handles delay and drumroll
        broadcastStats();
    });

    socket.on('admin:reset', () => {
        gameState.step = 'WAITING';
        gameState.votes = { yes: 0, no: 0 };
        io.emit('state-change', 'WAITING');
        io.emit('reset');
        broadcastStats();
    });
});

// Generating QR Code for the display page (optional, client-side can also do it)
app.get('/qr', (req, res) => {
    // In a real local setup, we need the local IP.
    // For now, let's just assume localhost or let client handle it.
    res.send('QR Endpoint');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`listening on *:${PORT}`);
});
