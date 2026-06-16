const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

let gameState = {
    stage: 'LEADER_ELECTION', // LEADER_ELECTION, QUESTION_INPUT, VOTING, RESULTS
    connectedUsers: {},       
    seats: Array(11).fill('empty'), 
    leaderSeat: null,
    question: '',
    votesReceived: 0
};

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    let assignedSeat = -1;
    const takenSeats = Object.values(gameState.connectedUsers);
    for (let i = 0; i < 11; i++) {
        if (!takenSeats.includes(i)) {
            assignedSeat = i;
            break;
        }
    }

    gameState.connectedUsers[socket.id] = assignedSeat;
    socket.emit('init', { state: gameState, yourSeat: assignedSeat });

    socket.on('startLeaderElection', () => {
        if (gameState.stage !== 'LEADER_ELECTION') return;
        gameState.leaderSeat = Math.floor(Math.random() * 11);
        io.emit('leaderSelecting', gameState.leaderSeat);

        setTimeout(() => {
            gameState.stage = 'QUESTION_INPUT';
            io.emit('updateState', gameState);
        }, 3000);
    });

    socket.on('submitQuestion', (questionText) => {
        if (gameState.stage !== 'QUESTION_INPUT') return;
        gameState.question = questionText;
        gameState.stage = 'VOTING';
        gameState.seats = Array(11).fill('empty'); 
        gameState.votesReceived = 0;
        io.emit('updateState', gameState);
    });

    socket.on('castVote', (choice) => {
        if (gameState.stage !== 'VOTING') return;
        const seat = gameState.connectedUsers[socket.id];
        if (seat === -1 || gameState.seats[seat] !== 'empty') return;

        gameState.seats[seat] = choice;
        gameState.votesReceived++;

        const activeVoters = Object.values(gameState.connectedUsers).filter(s => s >= 0).length;
        io.emit('seatUpdated', { seat, choice });

        if (gameState.votesReceived >= activeVoters) {
            gameState.stage = 'RESULTS';
            io.emit('updateState', gameState);
        }
    });

    socket.on('resetAll', () => {
        gameState.stage = 'LEADER_ELECTION';
        gameState.seats = Array(11).fill('empty');
        gameState.leaderSeat = null;
        gameState.question = '';
        gameState.votesReceived = 0;
        io.emit('updateState', gameState);
    });

    socket.on('disconnect', () => {
        delete gameState.connectedUsers[socket.id];
    });
});

server.listen(PORT, () => {
    console.log(`Сервер работает на порту ${PORT}`);
});
