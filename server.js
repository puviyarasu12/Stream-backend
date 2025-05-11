require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const authRoutes = require('./routes/auth');
const roomsRoutes = require('./routes/rooms');
const moviesRoutes = require('./routes/movies');
const triviaRoutes = require('./routes/trivia');
const usersRoutes = require('./routes/users');
const uploadRoutes = require('./routes/upload');

const app = express();
const httpServer = createServer(app);

// Configure Socket.IO with CORS
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Socket.IO event handlers
io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Client joined room: ${roomId}`);
  });

  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    console.log(`Client left room: ${roomId}`);
  });

  socket.on('poll-update', ({ roomId, poll }) => {
    io.to(roomId).emit('poll-update', poll);
    console.log(`Poll updated in room: ${roomId}`);
  });

  socket.on('new-trivia', ({ roomId, trivia }) => {
    io.to(roomId).emit('new-trivia', trivia);
    console.log(`New trivia in room: ${roomId}`);
  });

  socket.on('video-sync', ({ roomId, videoState }) => {
    socket.to(roomId).emit('video-sync', videoState);
    console.log(`Video sync in room: ${roomId}`);
  });

  socket.on('user-synced', ({ roomId, userId, username }) => {
    socket.to(roomId).emit('user-synced', { userId, username });
    console.log(`User ${username} synced in room: ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle pre-flight requests
app.options('*', cors());

// Middleware
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/movies', moviesRoutes);
app.use('/api/trivia', triviaRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/upload', uploadRoutes);

// Debug route
app.get('/api/debug', (req, res) => {
  res.json({ message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// MongoDB connection
const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/movie-stream-room';

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    console.log('Continuing without MongoDB connection...');
  });

// Start server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});