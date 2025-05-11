const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  photoURL: { type: String, default: '' },
  bio: { type: String, default: '' },
  socialLinks: {
    twitter: { type: String, default: '' },
    facebook: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    instagram: { type: String, default: '' },
    website: { type: String, default: '' },
  },
  preferences: {
    notifications: { type: Boolean, default: true },
    theme: { type: String, default: 'light' },
  },
  badges: [{ type: String }],
  lastLogin: { type: Date },
  watchlist: [{
    movie: {
      id: String,
      title: String,
      thumbnail: String,
      year: String,
    },
    votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    addedAt: { type: Date, default: Date.now },
  }],
  activityStats: {
    roomsCreated: { type: Number, default: 0 },
    roomsParticipated: { type: Number, default: 0 },
    messagesSent: { type: Number, default: 0 },
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);