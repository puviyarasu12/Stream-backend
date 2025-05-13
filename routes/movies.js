const express = require('express');
const router = express.Router();
const axios = require('axios');
const auth = require('../middleware/auth');

const OMDB_API_KEY = process.env.OMDB_API_KEY;
const OMDB_BASE_URL = 'https://www.omdbapi.com/';

// Helper function to check if movie is appropriate (for random movie generator)
const isAppropriateContent = (movieDetails) => {
  if (!movieDetails.Rated) return true;
  
  // Filter out adult content based on ratings
  const inappropriateRatings = ['R', 'NC-17', 'TV-MA', '18+', 'X'];
  return !inappropriateRatings.includes(movieDetails.Rated);
};

// Get random movie - MUST be before :imdbId route to prevent conflict
router.get('/random/movie', auth, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const randomYear = Math.floor(Math.random() * (currentYear - 1970 + 1)) + 1970;
    const searchTerms = ['love', 'hero', 'dream', 'star', 'night', 'day', 'life', 'world'];
    const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
    
    let appropriateMovieFound = false;
    let attempts = 0;
    let movie;

    while (!appropriateMovieFound && attempts < 5) {
      const response = await axios.get(OMDB_BASE_URL, {
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
      
      const detailsResponse = await axios.get(OMDB_BASE_URL, {
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
    res.status(500).json({ error: 'Failed to get random movie. Please try again.' });
  }
});

// Search movies and series - with optional type filtering
router.get('/search', auth, async (req, res) => {
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

    const response = await axios.get(OMDB_BASE_URL, { params });

    if (response.data.Error) {
      return res.status(404).json({ error: response.data.Error });
    }

    // Get details for each item but don't filter based on rating
    const results = await Promise.all(response.data.Search.map(async (item) => {
      const detailsResponse = await axios.get(OMDB_BASE_URL, {
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
    res.status(500).json({ error: 'Failed to perform search' });
  }
});

// Get movie details - MUST be after other specific routes
router.get('/:imdbId', auth, async (req, res) => {
  try {
    const response = await axios.get(OMDB_BASE_URL, {
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
    res.status(500).json({ error: 'Failed to get movie details' });
  }
});

module.exports = router;