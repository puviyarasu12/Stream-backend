const express = require('express');
const router = express.Router();

const triviaRouter = require('./trivia');
const Room = require('../models/Room');
const Message = require('../models/Message');
const auth = require('../middleware/auth');
const { customAlphabet } = require('nanoid');
const nanoid = customAlphabet('1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ', 6);
const Trivia = require('../models/Trivia');
const User = require('../models/User');

const mongoose = require('mongoose');

// Room-specific trivia routes

// Get trivia questions for a room
router.get('/:roomId/trivia', auth, async (req, res) => {
  try {
    const trivia = await Trivia.find({ room: req.params.roomId })
      .populate('createdBy', 'username')
      .sort({ timestamp: 1 });
    res.json(trivia);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new trivia question for a room
router.post('/:roomId/trivia', auth, async (req, res) => {
  try {
    const { question, options, correctAnswer, timestamp, category, movie } = req.body;
    const trivia = new Trivia({
      question,
      options,
      correctAnswer,
      timestamp,
      category,
      movie,
      createdBy: req.user.userId,
      room: req.params.roomId,
    });
    await trivia.save();
    const populatedTrivia = await Trivia.findById(trivia._id)
      .populate('createdBy', 'username');
    res.status(201).json(populatedTrivia);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit an answer for a trivia question in a room
router.post('/:roomId/trivia/:triviaId/answer', auth, async (req, res) => {
  try {
    const { answer } = req.body;
    const trivia = await Trivia.findOne({ _id: req.params.triviaId, room: req.params.roomId });
    if (!trivia) {
      return res.status(404).json({ error: 'Trivia not found' });
    }
    const isCorrect = answer === trivia.correctAnswer;
    res.json({ isCorrect });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new room
router.post('/', auth, async (req, res) => {
  try {
    const { name, movie, isPrivate } = req.body;

    // Check if room name already exists
    const existingRoom = await Room.findOne({ name, isActive: true });
    if (existingRoom) {
      return res.status(400).json({ error: 'A room with this name already exists' });
    }

    const roomData = {
      name,
      creator: req.user.userId,
      participants: [req.user.userId],
      movie: movie
        ? {
            title: movie.title,
            url: movie.url,
            thumbnail: movie.thumbnail,
            currentTime: movie.currentTime || 0,
            isPlaying: movie.isPlaying || false,
          }
        : null,
      isPrivate,
    };

    // Generate invite code for private rooms
    if (isPrivate) {
      roomData.inviteCode = nanoid();
    }

    const room = new Room(roomData);
    await room.save();

    const populatedRoom = await Room.findById(room._id)
      .populate('creator', 'username')
      .populate('participants', 'username')
      .populate('watchlist.addedBy', 'username');

    res.status(201).json(populatedRoom);
  } catch (error) {
    console.error('Error creating room:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'A room with this name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Join a private room by invite code or allow creator to join without invite code
router.post('/join', auth, async (req, res) => {
  try {
    const { inviteCode, roomId } = req.body;
    let room;

    if (roomId) {
      room = await Room.findById(roomId);
      if (!room || !room.isActive) {
        return res.status(404).json({ error: 'Room not found or inactive' });
      }
      // If user is not creator, require invite code
      if (room.creator.toString() !== req.user.userId) {
        if (!inviteCode || inviteCode !== room.inviteCode) {
          return res.status(403).json({ error: 'Invalid invite code' });
        }
      }
    } else {
      // If no roomId, fallback to inviteCode search
      if (!inviteCode) {
        return res.status(400).json({ error: 'Invite code or room ID required' });
      }
      room = await Room.findOne({ inviteCode, isActive: true });
      if (!room) return res.status(404).json({ error: 'Invalid invite code' });
    }

    if (room.bannedUsers.includes(req.user.userId)) {
      return res.status(403).json({ error: 'You are banned from this room' });
    }

    if (!room.participants.includes(req.user.userId)) {
      if (room.participants.length >= ((room.settings && room.settings.maxParticipants) || 50)) {
        return res.status(403).json({ error: 'Room has reached maximum participant limit' });
      }
      room.participants.push(req.user.userId);
      await room.save();
    }

    const populatedRoom = await Room.findById(room._id)
      .populate('creator', 'username')
      .populate('participants', 'username')
      .populate('watchlist.addedBy', 'username');
    res.json(populatedRoom);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all active rooms
router.get('/', auth, async (req, res) => {
  try {
    const rooms = await Room.find({ isActive: true })
      .populate('creator', 'username')
      .populate('participants', 'username')
      .populate('watchlist.addedBy', 'username');
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single room by ID
router.get('/:roomId', auth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.bannedUsers.includes(req.user.userId)) {
      return res.status(403).json({ error: 'You are banned from this room' });
    }

    // For private rooms, check if user is a participant
    if (room.isPrivate && !room.participants.includes(req.user.userId)) {
      return res.status(403).json({ error: 'Not authorized to access this room' });
    }

    // Check participant limit before adding new participant
    if (!room.participants.includes(req.user.userId)) {
      if (room.participants.length >= ((room.settings && room.settings.maxParticipants) || 50)) {
        return res.status(403).json({ error: 'Room has reached maximum participant limit' });
      }
      room.participants.push(req.user.userId);
      await room.save();
    }

    // Populate room data
    const populatedRoom = await Room.findById(room._id)
      .populate('creator', 'username')
      .populate('participants', 'username')
      .populate('watchlist.addedBy', 'username');

    res.json(populatedRoom);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update movie state
router.patch('/:roomId/movie', auth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (!room.participants.includes(req.user.userId)) {
      return res.status(403).json({ error: 'Not a participant' });
    }

    // Determine the type of playback event
    let eventType = 'seek';
    if (room.movie && room.movie.isPlaying !== req.body.isPlaying) {
      eventType = req.body.isPlaying ? 'play' : 'pause';
    } else if (room.movie && Math.abs(room.movie.currentTime - req.body.currentTime) > 5) {
      eventType = 'seek';
    } else if (req.body.timestamp) {
      eventType = 'sync';
    }

    // Track playback event for analytics
    room.playbackEvents.push({
      type: eventType,
      userId: req.user.userId,
      timestamp: new Date(),
    });

    // If there's a significant sync difference, track it
    if (room.movie && Math.abs(room.movie.currentTime - req.body.currentTime) > 2) {
      room.syncEvents.push({
        userId: req.user.userId,
        difference: room.movie.currentTime - req.body.currentTime,
        timestamp: new Date(),
      });
    }

    // Update movie state
    room.movie = {
      ...req.body,
      lastUpdated: new Date(),
    };

    await room.save();

    const populatedRoom = await Room.findById(room._id)
      .populate('creator', 'username')
      .populate('participants', 'username')
      .populate('watchlist.addedBy', 'username');

    res.json(populatedRoom);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add movie to watchlist
router.post('/:roomId/watchlist', auth, async (req, res) => {
  try {
    const { movie } = req.body;
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (!room.participants.includes(req.user.userId)) {
      return res.status(403).json({ error: 'Not a participant' });
    }
    room.watchlist.push({
      movie: {
        id: movie.id,
        title: movie.title,
        thumbnail: movie.thumbnail,
        year: movie.year,
      },
      addedBy: req.user.userId,
      votes: [req.user.userId], // Auto-vote by adder
    });
    await room.save();
    const populatedRoom = await Room.findById(room._id)
      .populate('creator', 'username')
      .populate('participants', 'username')
      .populate('watchlist.addedBy', 'username');
    res.json(populatedRoom);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Vote/unvote for a movie
router.post('/:roomId/watchlist/:movieId/vote', auth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (!room.participants.includes(req.user.userId)) {
      return res.status(403).json({ error: 'Not a participant' });
    }
    const watchlistItem = room.watchlist.find(
      (item) => item.movie.id === req.params.movieId
    );
    if (!watchlistItem) {
      return res.status(404).json({ error: 'Movie not in watchlist' });
    }
    const userVoted = watchlistItem.votes.includes(req.user.userId);
    if (userVoted) {
      watchlistItem.votes = watchlistItem.votes.filter(
        (vote) => vote.toString() !== req.user.userId
      );
    } else {
      watchlistItem.votes.push(req.user.userId);
    }
    await room.save();
    const populatedRoom = await Room.findById(room._id)
      .populate('creator', 'username')
      .populate('participants', 'username')
      .populate('watchlist.addedBy', 'username');
    res.json(populatedRoom);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Select movie from watchlist
router.post('/:roomId/watchlist/:movieId/select', auth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.creator.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Only the creator can select a movie' });
    }
    const watchlistItem = room.watchlist.find(
      (item) => item.movie.id === req.params.movieId
    );
    if (!watchlistItem) {
      return res.status(404).json({ error: 'Movie not in watchlist' });
    }
    room.movie = {
      title: watchlistItem.movie.title,
      url: `https://www.youtube.com/watch?v=${watchlistItem.movie.id}`,
      thumbnail: watchlistItem.movie.thumbnail,
      currentTime: 0,
      isPlaying: true,
    };
    room.watchlist = room.watchlist.filter(
      (item) => item.movie.id !== watchlistItem.movie.id
    );
    await room.save();
    const populatedRoom = await Room.findById(room._id)
      .populate('creator', 'username')
      .populate('participants', 'username')
      .populate('watchlist.addedBy', 'username');
    res.json(populatedRoom);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages for a room

router.get('/:roomId/messages', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.roomId)) {
      return res.status(400).json({ error: 'Invalid room ID' });
    }
    const messages = await Message.find({ room: req.params.roomId })
      .populate('user', 'username')
      .sort({ timestamp: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a message to a room
router.post('/:roomId/messages', auth, async (req, res) => {
  try {
    const { content } = req.body;
    const message = new Message({
      room: req.params.roomId,
      user: req.user.userId,
      content,
    });
    await message.save();
    const populatedMessage = await Message.findById(message._id).populate(
      'user',
      'username'
    );
    res.status(201).json(populatedMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update room settings
router.patch('/:roomId/settings', auth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.creator.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Only the creator can modify room settings' });
    }

    const allowedSettings = [
      'maxParticipants',
      'allowChat',
      'allowWatchlist',
      'allowTrivia',
      'autoplay',
      'description',
      'videoLink',
    ];

    const settings = {};
    for (const key of allowedSettings) {
      if (req.body[key] !== undefined) {
        settings[key] = req.body[key];
      }
    }

    room.settings = { ...room.settings, ...settings };

    // If videoLink is updated, also update room.movie.url
    if (settings.videoLink !== undefined) {
      room.movie = room.movie || {};
      room.movie.url = settings.videoLink;
      // Optionally reset other movie fields if needed
      room.movie.title = 'Custom Video';
      room.movie.currentTime = 0;
      room.movie.isPlaying = false;
      room.movie.lastUpdated = new Date();
    }

    await room.save();

    const populatedRoom = await Room.findById(room._id)
      .populate('creator', 'username')
      .populate('participants', 'username')
      .populate('watchlist.addedBy', 'username');

    res.json(populatedRoom);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a room
router.delete('/:roomId', auth, async (req, res) => {
  try {
    console.log('Delete room request received for roomId:', req.params.roomId);
    const room = await Room.findById(req.params.roomId);
    if (!room) {
      console.log('Room not found for ID:', req.params.roomId);
      return res.status(404).json({ error: 'Room not found' });
    }
    if (room.creator.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Only the creator can delete the room' });
    }
    // Mark room as inactive instead of deleting for safety
    room.isActive = false;
    await room.save();
    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get invite code for a room (only accessible by the room creator)
router.get('/:roomId/invite-code', auth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    if (room.creator.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to access invite code' });
    }
    if (!room.isPrivate || !room.inviteCode) {
      return res.status(404).json({ error: 'Invite code not found' });
    }
    res.json({ inviteCode: room.inviteCode });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
