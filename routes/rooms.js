const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const Message = require('../models/Message');
const auth = require('../middleware/auth');
const { customAlphabet } = require('nanoid');
const nanoid = customAlphabet('1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ', 6);
const Trivia = require('../models/Trivia');
const User = require('../models/User');

const mongoose = require('mongoose');

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

    // Filter out banned users from participants
    room.participants = room.participants.filter(
      (participantId) => !room.bannedUsers.includes(participantId.toString())
    );

    if (!room.participants.includes(req.user.userId)) {
      if (room.participants.length >= ((room.settings && room.settings.maxParticipants) || 50)) {
        return res.status(403).json({ error: 'Room has reached maximum participant limit' });
      }
      room.participants.push(req.user.userId);
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

    // Filter out banned users from participants
    room.participants = room.participants.filter(
      (participantId) => !room.bannedUsers.includes(participantId.toString())
    );

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
    }

    await room.save();

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


// Select movie from watchlist

// Get messages for a room

router.get('/:roomId/messages', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.roomId)) {
      return res.status(400).json({ error: 'Invalid room ID' });
    }

    const limit = parseInt(req.query.limit) || 20;
    const before = req.query.before;

    let query = { room: req.params.roomId };
    if (before) {
      // If before is a valid ISO date string, use timestamp filter
      const beforeDate = new Date(before);
      if (!isNaN(beforeDate.getTime())) {
        query.timestamp = { $lt: beforeDate };
      } else if (mongoose.Types.ObjectId.isValid(before)) {
        // If before is a valid ObjectId, find message with that ID to get timestamp
        const beforeMessage = await Message.findById(before);
        if (beforeMessage) {
          query.timestamp = { $lt: beforeMessage.timestamp };
        }
      }
    }

    const messages = await Message.find(query)
      .populate('user', 'username')
      .sort({ timestamp: -1 })
      .limit(limit);

    // Return messages sorted ascending for display
    res.json(messages.reverse());
  } catch (error) {
    console.error('Error fetching messages:', error);
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

// Add or remove a reaction to a message

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

/**
 * Get a random active room
 */
router.get('/random/active', auth, async (req, res) => {
  try {
    const count = await Room.countDocuments({ isActive: true });
    if (count === 0) {
      return res.status(404).json({ error: 'No active rooms found' });
    }
    const random = Math.floor(Math.random() * count);
    const room = await Room.findOne({ isActive: true }).skip(random)
      .populate('creator', 'username')
      .populate('participants', 'username')
      .populate('watchlist.addedBy', 'username');
    if (!room) {
      return res.status(404).json({ error: 'No active rooms found' });
    }
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
