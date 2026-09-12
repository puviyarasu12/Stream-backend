const axios = require('axios');

const OMDB_BASE_URL = 'https://www.omdbapi.com/';

/**
 * Lightweight AI MovieInsight Generator
 * - Tries Groq AI if available
 * - Automatically falls back to OMDB data if Groq is unavailable, rate-limited, or no API key is provided
 * - Zero dependency on Wikipedia or complex scrapers
 */
async function generateMovieInsight({ query, omdbApiKey, groqApiKey, groqModel }) {
  const cleanQuery = (query || '').trim();

  // 1. Try Groq AI if key is configured
  if (groqApiKey) {
    try {
      const prompt = `You are MovieInsight. Provide a concise, structured overview of "${cleanQuery}" with premise, director, cast, themes, and why it's worth watching. Use clear markdown headings (###, ####) and bullet points.`;
      const res = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: groqModel || 'qwen/qwen3.8-27b',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 600,
          temperature: 0.7,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqApiKey}`,
          },
          timeout: 4000,
        }
      );

      const answer = res.data?.choices?.[0]?.message?.content;
      if (answer && answer.trim().length > 10) {
        return {
          answer: answer.trim(),
          summary: answer.trim(),
          source: 'ai-enhanced',
          title: cleanQuery,
        };
      }
    } catch (e) {
      // Groq failed or rate-limited; smoothly fall through to direct OMDB insight
    }
  }

  // 2. Direct OMDB insight (Zero AI key needed, fast, accurate)
  const omdbRes = await axios
    .get(OMDB_BASE_URL, {
      params: { apikey: omdbApiKey, t: cleanQuery, plot: 'full' },
      timeout: 5000,
    })
    .catch(() => null);

  const m = omdbRes?.data;
  if (m && m.Response !== 'False') {
    const summary = [
      `### 🎬 ${m.Title} (${m.Year})`,
      `**Director:** ${m.Director || 'N/A'} | **Cast:** ${m.Actors || 'N/A'}`,
      `**Genre:** ${m.Genre || 'N/A'} | **Rated:** ${m.Rated || 'N/A'} | ⭐ **IMDb:** ${m.imdbRating || 'N/A'}/10`,
      '',
      `#### 📖 Storyline & Premise`,
      m.Plot || 'No plot summary available.',
      '',
      m.Awards && m.Awards !== 'N/A' ? `#### 🏆 Accolades\n${m.Awards}\n` : '',
      `#### 🍿 Quick Verdict`,
      `A compelling ${m.Genre || 'cinematic'} release recommended for viewers seeking strong storytelling and memorable performances.`,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      answer: summary,
      summary,
      source: 'omdb-insight',
      title: m.Title,
      year: m.Year,
      rating: m.imdbRating,
      poster: m.Poster && m.Poster !== 'N/A' ? m.Poster : null,
    };
  }

  // 3. Fallback if movie is not found in OMDB
  const fallback = `### 🎬 Insight for "${cleanQuery}"\nNo detailed record was found for this title. Please check the spelling or search for another movie.`;
  return {
    answer: fallback,
    summary: fallback,
    source: 'fallback',
    title: cleanQuery,
  };
}

module.exports = { generateMovieInsight };
