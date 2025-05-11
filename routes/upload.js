const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary').v2;
const crypto = require('crypto');

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dtvk8n4h8',
  api_key: process.env.CLOUDINARY_API_KEY || '861475431651897',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'mFVUDK2fStLCJk-EDafvgx7eg3A',
});

// Endpoint to get a signed upload signature
router.get('/sign-upload', (req, res) => {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const paramsToSign = `timestamp=${timestamp}${cloudinary.config().api_secret}`;
    console.log('Signing params:', paramsToSign);
    const signature = crypto
      .createHash('sha1')
      .update(paramsToSign)
      .digest('hex');

    res.json({
      timestamp,
      signature,
      api_key: cloudinary.config().api_key,
      cloud_name: cloudinary.config().cloud_name,
    });
  } catch (error) {
    console.error('Error generating Cloudinary signature:', error.message);
    res.status(500).json({ error: 'Failed to generate upload signature' });
  }
});

module.exports = router;