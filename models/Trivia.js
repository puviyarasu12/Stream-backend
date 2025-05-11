// models/Trivia.js
const mongoose = require('mongoose');

const triviaSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' }, // Made optional
  movie: { type: String, required: true }, // Movie title or ID
  question: { type: String, required: true },
  options: [{ type: String, required: true }], // Array of answer options
  correctAnswer: { type: String, required: true },
  timestamp: { type: Number }, // Optional timestamp for room-specific trivia
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  category: { type: String, default: 'General' }, // Added category field
  points: { type: Number, default: 0 } // Added points field to track total points
});

module.exports = mongoose.model('Trivia', triviaSchema);