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
    leaderVotes: Array(11).fill(0), // Храним количество голосов за каждое кресло
    votedForLeader: {},             // Кто уже проголосовал за лидера (socket.id -> true)
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

    // Голосование за председателя
    socket.on('voteForLeader', (targetSeat) => {
        if (gameState.stage !== 'LEADER_ELECTION') return;
        if (gameState.votedForLeader[socket.id]) return; // Один человек - один голос

        gameState.votedForLeader[socket.id] = true;
        gameState.leaderVotes[targetSeat]++;

        // Отправляем всем обновленные счетчики голосов за председателя
        io.emit('leaderVotesUpdated', gameState.leaderVotes);

        // Проверяем, проголосовали ли все активные участники
        const activeVotersCount = Object.values(gameState.connectedUsers).filter(s => s >= 0).length;
        const totalVotesCast = Object.keys(gameState.votedForLeader).length;

        if (totalVotesCast >= activeVotersCount && activeVotersCount > 0) {
            // Находим кресло с максимальным числом голосов
            let maxVotes = -1;
            let winnerSeat = 0;
            for (let i = 0; i < 11; i++) {
                if (gameState.leaderVotes[i] > maxVotes) {
                    maxVotes = gameState.leaderVotes[i];
                    winnerSeat = i;
                }
            }

            gameState.leaderSeat = winnerSeat;
            io.emit('leaderDetermined', gameState.leaderSeat);

            // Переходим к вводу вопроса через 3 секунды, чтобы все увидели победителя
            setTimeout(() => {
                gameState.stage = 'QUESTION_INPUT';
                io.emit('updateState', gameState);
            }, 3000);
        }
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
        gameState.leaderVotes = Array(11).fill(0);
        gameState.votedForLeader = {};
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
    console.log(`Сервер запущен`);
});
