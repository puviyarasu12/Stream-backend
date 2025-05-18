const express = require('express');
const router = express.Router();
const axios = require('axios');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit'); // For rate limiting
const { query, body, validationResult } = require('express-validator'); // Updated express-validator import
const createError = require('http-errors'); // For consistent error handling

// Environment variable validation
const OMDB_API_KEY = process.env.OMDB_API_KEY || (() => { throw new Error('OMDB_API_KEY is not set'); })();
const OMDB_BASE_URL = 'https://www.omdbapi.com/';

// Rate limiting middleware to prevent abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { error: 'Too many requests, please try again later.' },
});

// Apply rate limiting to all routes
router.use(apiLimiter);

// Configure axios with timeout
const axiosInstance = axios.create({
  timeout: 10000, // 10-second timeout for all requests
});

// Helper function to check if movie is appropriate (for random movie generator)
const isAppropriateContent = (movieDetails) => {
  if (!movieDetails.Rated) return true;
  
  // Filter out adult content based on ratings
  const inappropriateRatings = ['R', 'NC-17', 'TV-MA', '18+', 'X'];
  return !inappropriateRatings.includes(movieDetails.Rated);
};

// Input sanitization and validation middleware for query parameters
const sanitizeQuery = [
  query('query').trim().escape().notEmpty().withMessage('Query is required'),
  query('type').optional().trim().toLowerCase().isIn(['movie', 'series', '']).withMessage('Type must be movie or series'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    next();
  },
];

// Input sanitization and validation middleware for body
const sanitizeBody = [
  body('movieName').trim().escape().notEmpty().withMessage('Movie name is required'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    next();
  },
];

// Get random movie - MUST be before :imdbId route to prevent conflict
router.get('/random/movie', auth, apiLimiter, async (req, res, next) => {
  try {
    const currentYear = new Date().getFullYear();
    const randomYear = Math.floor(Math.random() * (currentYear - 1970 + 1)) + 1970;
    const searchTerms = ['love', 'hero', 'dream', 'star', 'night', 'day', 'life', 'world'];
    const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
    
    let appropriateMovieFound = false;
    let attempts = 0;
    let movie;

    while (!appropriateMovieFound && attempts < 5) {
      const response = await axiosInstance.get(OMDB_BASE_URL, {
        params: {
          apikey: OMDB_API_KEY,
          s: randomTerm,
          type: 'movie',
          y: randomYear
        }
      });

      if (response.data.Error) {
        console.error('OMDB Search Error:', response.data.Error);
        return res.status(404).json({ error: 'No movies found. Please try again.' });
      }

      const movies = response.data.Search;
      if (!movies || movies.length === 0) {
        return res.status(404).json({ error: 'No movies found. Please try again.' });
      }

      const randomMovie = movies[Math.floor(Math.random() * movies.length)];
      
      const detailsResponse = await axiosInstance.get(OMDB_BASE_URL, {
        params: {
          apikey: OMDB_API_KEY,
          i: randomMovie.imdbID,
          plot: 'full'
        }
      });

      if (!detailsResponse.data.Error && isAppropriateContent(detailsResponse.data)) {
        appropriateMovieFound = true;
        movie = {
          id: detailsResponse.data.imdbID,
          title: detailsResponse.data.Title,
          year: detailsResponse.data.Year,
          plot: detailsResponse.data.Plot,
          director: detailsResponse.data.Director,
          actors: detailsResponse.data.Actors,
          genre: detailsResponse.data.Genre,
          runtime: detailsResponse.data.Runtime,
          rating: detailsResponse.data.imdbRating,
          rated: detailsResponse.data.Rated,
          thumbnail: detailsResponse.data.Poster
        };
      }
      attempts++;
    }

    if (!appropriateMovieFound) {
      return res.status(404).json({ error: 'Could not find appropriate movie. Please try again.' });
    }

    res.json(movie);
  } catch (error) {
    console.error('Random movie error:', error);
    next(createError(500, 'Failed to get random movie. Please try again.'));
  }
});

// Search movies and series - with optional type filtering
router.get('/search', auth, apiLimiter, sanitizeQuery, async (req, res, next) => {
  try {
    const { query, type } = req.query;

    // Validate type parameter
    let omdbType;
    if (type === 'movie' || type === 'series') {
      omdbType = type;
    } else {
      omdbType = undefined; // no type filter for all types
    }

    const params = {
      apikey: OMDB_API_KEY,
      s: query,
    };
    if (omdbType) {
      params.type = omdbType;
    }

    const response = await axiosInstance.get(OMDB_BASE_URL, { params });

    if (response.data.Error) {
      return res.status(404).json({ error: response.data.Error });
    }

    // Get details for each item but don't filter based on rating
    const results = await Promise.all(response.data.Search.map(async (item) => {
      const detailsResponse = await axiosInstance.get(OMDB_BASE_URL, {
        params: {
          apikey: OMDB_API_KEY,
          i: item.imdbID,
          plot: 'full'
        }
      });

      if (!detailsResponse.data.Error) {
        return {
          id: item.imdbID,
          title: item.Title,
          year: item.Year,
          thumbnail: item.Poster,
          type: item.Type,
          rated: detailsResponse.data.Rated
        };
      } else {
        return null;
      }
    }));

    // Limit results to max 10 items to avoid cutoff issues
    const limitedResults = results.filter(r => r !== null).slice(0, 10);

    res.json(limitedResults);
  } catch (error) {
    console.error('Search error:', error);
    next(createError(500, 'Failed to perform search'));
  }
});

// Get movie details - MUST be after other specific routes
router.get('/:imdbId', auth, apiLimiter, async (req, res, next) => {
  try {
    // Validate IMDb ID format
    if (!req.params.imdbId.match(/^tt\d{7,8}$/)) {
      return res.status(400).json({ error: 'Invalid IMDb ID format' });
    }

    const response = await axiosInstance.get(OMDB_BASE_URL, {
      params: {
        apikey: OMDB_API_KEY,
        i: req.params.imdbId,
        plot: 'full'
      }
    });

    if (response.data.Error) {
      return res.status(404).json({ error: response.data.Error });
    }

    const movie = {
      id: response.data.imdbID,
      title: response.data.Title,
      year: response.data.Year,
      plot: response.data.Plot,
      director: response.data.Director,
      actors: response.data.Actors,
      genre: response.data.Genre,
      runtime: response.data.Runtime,
      rating: response.data.imdbRating,
      rated: response.data.Rated,
      thumbnail: response.data.Poster
    };

    res.json(movie);
  } catch (error) {
    console.error('Movie details error:', error);
    next(createError(500, 'Failed to get movie details'));
  }
});


router.post('/summary', auth, apiLimiter, async (req, res, next) => {
  const { question } = req.body;

  if (!question || question.trim() === '') {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    const prompt = `You are a movie expert AI assistant. Provide extremely detailed, informative, and comprehensive answers to questions related to movies, movie-related people (actors, directors, producers), and the movie industry. Elaborate extensively, include as much relevant information as possible, and provide insightful context and background. Structure your response clearly with paragraphs and sections if needed. Do not include images or URLs. If the question is unrelated, respond politely that you only answer movie-related questions.\n\nUser question: ${question}`;
    
    const cohereResponse = await axiosInstance.post(
      'https://api.cohere.ai/v1/chat',
      {
        model: 'command-r',
        message: prompt,
        max_tokens: 4096,
        temperature: 0.7
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer NfV6q56ZEvQSVeUJKyLJw5OqlJ8UiQR7tv3BY5ti`,
        },
      }
    );

    let aiAnswer = cohereResponse.data?.text || 'Answer not available.';

    // Remove image URLs extraction and base64 conversion to avoid images in the answer
    // Just return the AI answer text as is without modification
    // aiAnswer remains unchanged

    return res.json({ answer: aiAnswer });
  } catch (error) {
    if (error.response) {
      console.error('Cohere API error response:', error.response.status, error.response.data);
    } else if (error.request) {
      console.error('Cohere API no response received:', error.request);
    } else {
      console.error('Error setting up Cohere API request:', error.message);
    }
    next(createError(500, 'Failed to generate answer'));
  }
});



// Error handling middleware
router.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    status: err.status || 500,
  });
});

module.exports = router;