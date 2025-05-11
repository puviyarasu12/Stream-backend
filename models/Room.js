const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  movie: {
    title: String,
    url: String,
    thumbnail: String,
    currentTime: { type: Number, default: 0 },
    isPlaying: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now }
  },
  settings: {
    videoLink: { type: String, default: '' }
  },
  watchlist: [{
    movie: {
      id: String,
      title: String,
      thumbnail: String,
      year: String,
    },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
    addedAt: { type: Date, default: Date.now }
  }],
  isPrivate: { type: Boolean, default: false },
  inviteCode: { type: String, unique: true, sparse: true },
  bannedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  // Analytics tracking
  participationHistory: [{
    count: Number,
    timestamp: { type: Date, default: Date.now },
    duration: { type: Number, default: 0 } // in seconds
  }],
  playbackEvents: [{
    type: { type: String, enum: ['play', 'pause', 'seek', 'sync'] },
    timestamp: { type: Date, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    position: Number // video position in seconds
  }],
  syncEvents: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
    difference: Number // sync difference in seconds
  }]
});

module.exports = mongoose.model('Room', roomSchema);