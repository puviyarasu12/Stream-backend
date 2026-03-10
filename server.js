require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const { createServer } = require('http');
const { Server } = require('socket.io');
const authRoutes = require('./routes/auth');
const roomsRoutes = require('./routes/rooms');
const moviesRoutes = require('./routes/movies');
const triviaRoutes = require('./routes/trivia');
const usersRoutes = require('./routes/users');

const app = express();
const httpServer = createServer(app);

// Configure Socket.IO with CORS
const allowedOrigins = [
  'http://localhost:3000',
  'https://stream-frontend-git-main-puvis-projects-1593e6f5.vercel.app',
  'https://stream-frontend-ivory.vercel.app',
  'https://stream-frontend-puvis-projects-1593e6f5.vercel.app',
];

const io = new Server(httpServer, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// FIX: Attach io to app so route handlers can broadcast video-sync events
// Usage in routes: const io = req.app.get('io');
app.set('io', io);

// Socket.IO event handlers
io.on('connection', (socket) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('Client connected:', socket.id);
  }

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Client ${socket.id} joined room: ${roomId}`);
    }
  });

  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Client ${socket.id} left room: ${roomId}`);
    }
  });

  // FIX: Client emits video-sync for fast peer-to-peer sync (no DB round-trip).
  // Server relays to all OTHER users in the room only (excludes sender).
  socket.on('video-sync', ({ roomId, videoState }) => {
    socket.to(roomId).emit('video-sync', videoState);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Video sync in room ${roomId}: playing=${videoState.isPlaying} time=${videoState.currentTime}`);
    }
  });

  socket.on('new-trivia', ({ roomId, trivia }) => {
    io.to(roomId).emit('new-trivia', trivia);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`New trivia in room: ${roomId}`);
    }
  });

  socket.on('user-synced', ({ roomId, userId, username }) => {
    socket.to(roomId).emit('user-synced', { userId, username });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`User ${username} synced in room: ${roomId}`);
    }
  });

  socket.on('disconnect', () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('Client disconnected:', socket.id);
    }
  });
});

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Handle pre-flight requests
app.options('*', cors());

// Middleware
app.use(express.json());

// File upload middleware
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: '/tmp/',
    createParentPath: true,
  })
);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/movies', moviesRoutes);
app.use('/api/trivia', triviaRoutes);
app.use('/api/users', usersRoutes);

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

mongoose
  .connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    console.log('Continuing without MongoDB connection...');
  });

// Start server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
