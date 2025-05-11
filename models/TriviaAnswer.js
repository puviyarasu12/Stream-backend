// models/TriviaAnswer.js
const mongoose = require('mongoose');

const triviaAnswerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  triviaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trivia', required: true },
  answer: { type: String, required: true },
  isCorrect: { type: Boolean, required: true },
  answeredAt: { type: Date, default: Date.now }
});

triviaAnswerSchema.index({ userId: 1, triviaId: 1 }, { unique: true });

module.exports = mongoose.model('TriviaAnswer', triviaAnswerSchema);
