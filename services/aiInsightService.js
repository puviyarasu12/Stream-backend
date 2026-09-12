const axios = require('axios');

const OMDB_BASE_URL = 'https://www.omdbapi.com/';
const AI_MODELS = ['groq/compound-mini', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];

/**
 * Lightweight Generative AI MovieInsight Service
 * - Uses real Generative AI with multi-model failover for high reliability
 * - Completely eliminated Wikipedia & 400+ lines of scrapers
 * - Graceful fallback to OMDB metadata if external AI is unreachable
 */
async function generateMovieInsight({ query, omdbApiKey, groqApiKey }) {
  const cleanQuery = (query || '').trim();

  // 1. Real Generative AI with automatic model failover
  if (groqApiKey) {
    const prompt = `You are MovieInsight, an expert cinematic guide. Provide a concise, engaging response for "${cleanQuery}". Use markdown headers (###, ####), bullet points, and highlight key elements (premise, themes, cast, verdict, or direct answers to the question). Avoid spoilers unless asked.`;

    for (const model of AI_MODELS) {
      try {
        const res = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 700,
            temperature: 0.7,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${groqApiKey}`,
            },
            timeout: 5000,
          }
        );

        const answer = res.data?.choices?.[0]?.message?.content?.trim();
        if (answer && answer.length > 20) {
          return {
            answer,
            summary: answer,
            source: 'generative-ai',
            model,
            title: cleanQuery,
          };
        }
      } catch (err) {
        // Failover: if one model is rate-limited or busy, try the next model
      }
    }
  }

  // 2. Direct OMDB fallback (if AI service is down or unconfigured)
  const omdbRes = await axios
    .get(OMDB_BASE_URL, {
      params: { apikey: omdbApiKey, t: cleanQuery, plot: 'full' },
      timeout: 4000,
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

  // 3. Fallback message
  const fallback = `### 🎬 MovieInsight: "${cleanQuery}"\nNo detailed record was found. Please check the movie title or ask another film-related question.`;
  return { answer: fallback, summary: fallback, source: 'fallback', title: cleanQuery };
}

module.exports = { generateMovieInsight };
