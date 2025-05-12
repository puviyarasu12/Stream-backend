const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ,
  api_key: process.env.CLOUDINARY_API_KEY ,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Get user's watchlist
router.get('/watchlist', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.watchlist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add movie to user's watchlist
router.post('/watchlist', auth, async (req, res) => {
  try {
    const { movie } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Check if movie already in watchlist
    const exists = user.watchlist.some(item => item.movie.id === movie.id);
    if (exists) {
      return res.status(400).json({ error: 'Movie already in watchlist' });
    }

    user.watchlist.push({
      movie: {
        id: movie.id,
        title: movie.title,
        thumbnail: movie.thumbnail,
        year: movie.year,
      },
      votes: [req.user.userId], // Auto-vote by adder
      addedAt: new Date(),
    });
    await user.save();
    res.json(user.watchlist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove movie from user's watchlist
router.delete('/watchlist/:movieId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.watchlist = user.watchlist.filter(item => item.movie.id !== req.params.movieId);
    await user.save();
    res.json(user.watchlist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Vote/unvote for a movie in user's watchlist
router.post('/watchlist/:movieId/vote', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const watchlistItem = user.watchlist.find(item => item.movie.id === req.params.movieId);
    if (!watchlistItem) {
      return res.status(404).json({ error: 'Movie not in watchlist' });
    }

    const userVoted = watchlistItem.votes.includes(req.user.userId);
    if (userVoted) {
      watchlistItem.votes = watchlistItem.votes.filter(vote => vote.toString() !== req.user.userId);
    } else {
      watchlistItem.votes.push(req.user.userId);
    }
    await user.save();
    res.json(user.watchlist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Select movie from user's watchlist (e.g., to play or mark as selected)
router.post('/watchlist/:movieId/select', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const watchlistItem = user.watchlist.find(item => item.movie.id === req.params.movieId);
    if (!watchlistItem) {
      return res.status(404).json({ error: 'Movie not in watchlist' });
    }

    // For now, just remove the selected movie from watchlist
    user.watchlist = user.watchlist.filter(item => item.movie.id !== req.params.movieId);
    await user.save();

    // You can extend this to trigger playing the movie or other actions
    res.json(user.watchlist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// New endpoint: Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Exclude badges, activityStats, lastLogin from response
    const userObj = user.toObject();
    delete userObj.badges;
    delete userObj.activityStats;
    delete userObj.lastLogin;

    res.json(userObj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

 
// New endpoint: Update user profile (username and avatar)
router.put('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Update username if provided
    if (req.body.username) {
      user.username = req.body.username;
    }

    await user.save();

    // Handle avatar upload if provided
    if (req.files && req.files.avatar) {
      const avatarFile = req.files.avatar;

      // Upload avatar to Cloudinary
      const result = await cloudinary.uploader.upload(avatarFile.tempFilePath, {
        folder: 'avatars',
        public_id: `user_${user._id}_avatar`,
        overwrite: true,
        resource_type: 'image',
      });

      user.photoURL = result.secure_url;

      // Optionally, delete the temp file if needed
      const fs = require('fs');
      fs.unlink(avatarFile.tempFilePath, (err) => {
        if (err) console.error('Failed to delete temp file:', err);
      });

      await user.save();
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
