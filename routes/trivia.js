// routes/trivia.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Trivia = require('../models/Trivia');

// GET /api/trivia - Get all trivia questions
router.get('/', async (req, res) => {
  try {
    const triviaList = await Trivia.find().populate('createdBy', 'username').exec();
    res.json(triviaList);
  } catch (error) {
    console.error('Error fetching trivia:', error.message);
    res.status(500).json({ error: 'Failed to fetch trivia' });
  }
});

// POST /api/trivia - Create a new trivia question
router.post('/', auth, async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      console.error('No user in request:', req.user);
      return res.status(401).json({ error: 'Unauthorized: User not authenticated' });
    }

    const { question, options, correctAnswer, timestamp, category, movie } = req.body;

    // Validate request body
    if (!question || !options || !correctAnswer) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!Array.isArray(options) || options.length !== 4) {
      return res.status(400).json({ error: 'Options must be an array of 4 items' });
    }

    const trivia = new Trivia({
      question,
      options,
      correctAnswer,
      timestamp: timestamp || 0,
      category: category || 'General',
      movie: movie || 'General',
      createdBy: req.user.userId,
    });

    const savedTrivia = await trivia.save();
    const populatedTrivia = await savedTrivia.populate('createdBy', 'username');
    res.status(201).json(populatedTrivia);
  } catch (error) {
    console.error('Error creating trivia:', error.message);
    res.status(500).json({ error: 'Failed to create trivia', details: error.message });
  }
});

// POST /api/trivia/:id/answer - Submit an answer to a trivia question
router.post('/:id/answer', auth, async (req, res) => {
  try {
    const triviaId = req.params.id;
    const userId = req.user.userId;
    const { answer } = req.body;

    if (!answer) {
      return res.status(400).json({ error: 'Answer is required' });
    }

    const trivia = await Trivia.findById(triviaId);
    if (!trivia) {
      return res.status(404).json({ error: 'Trivia question not found' });
    }

    // Check if user has already answered this trivia
    const existingAnswer = await require('../models/TriviaAnswer').findOne({ userId, triviaId });
    if (existingAnswer) {
      return res.json({
        isCorrect: existingAnswer.isCorrect,
        points: trivia.points,
        message: 'You have already answered this question.'
      });
    }

    const isCorrect = trivia.correctAnswer === answer;

    // Save the user's answer
    const TriviaAnswer = require('../models/TriviaAnswer');
    const triviaAnswer = new TriviaAnswer({
      userId,
      triviaId,
      answer,
      isCorrect
    });
    await triviaAnswer.save();

    // Increment points if correct
    if (isCorrect) {
      trivia.points = (trivia.points || 0) + 1;
      await trivia.save();
    }

    res.json({ isCorrect, points: trivia.points });
  } catch (error) {
    console.error('Error submitting trivia answer:', error.message);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

// The PUT and DELETE routes for editing and deleting trivia questions have been removed as per user request.

// GET /api/trivia/answered - Get trivia IDs answered by the authenticated user
router.get('/answered', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const TriviaAnswer = require('../models/TriviaAnswer');
    const answered = await TriviaAnswer.find({ userId }).select('triviaId').exec();
    const answeredTriviaIds = answered.map((a) => a.triviaId.toString());
    res.json({ answeredTriviaIds });
  } catch (error) {
    console.error('Error fetching answered trivia:', error.message);
    res.status(500).json({ error: 'Failed to fetch answered trivia' });
  }
});

module.exports = router;
