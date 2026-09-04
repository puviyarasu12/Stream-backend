const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

router.post('/register', async (req, res) => {
  try {
    const { username: rawUsername, email: rawEmail, password } = req.body || {};
    const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    if (mongoose.connection.readyState !== 1) {
      console.error('Registration unavailable: MongoDB is not connected');
      return res.status(503).json({ error: 'Registration is temporarily unavailable' });
    }

    const existingUser = await User.findOne({ email }).select('_id').lean();
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: 'User created successfully', registrationSuccess: true });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Unable to create account' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email: rawEmail, password } = req.body || {};
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (mongoose.connection.readyState !== 1) {
      console.error('Login unavailable: MongoDB is not connected');
      return res.status(503).json({ error: 'Login is temporarily unavailable' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const jwtSecret = process.env.JWT_SECRET || 'fallback-secret-key-for-development';
    const token = jwt.sign({ userId: user._id }, jwtSecret);
    res.json({ token, userId: user._id, username: user.username });
  } catch (error) {
    console.error('Login error:', error);
    if (error.name === 'MongooseError' || error.name === 'MongoServerSelectionError') {
      return res.status(503).json({ error: 'Login is temporarily unavailable' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Get current user information
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      photoURL: user.photoURL || '',
      bio: user.bio || '',
      socialLinks: user.socialLinks || {},
      preferences: user.preferences || {},
      badges: user.badges || [],
      lastLogin: user.lastLogin,
      activityStats: user.activityStats || {},
      watchlist: user.watchlist,
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
