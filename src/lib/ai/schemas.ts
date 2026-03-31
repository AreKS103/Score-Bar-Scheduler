import { z } from 'zod';

// ── Minimal match summary sent TO the AI (input) ────────────────────────────

export const MatchInputSchema = z.object({
  id: z.string(),
  t: z.string().describe('Title: "Home vs Away" or event name'),
  l: z.string().describe('League label'),
  d: z.string().describe('Date YYYY-MM-DD'),
});

export type MatchInput = z.infer<typeof MatchInputSchema>;

// ── AI response: just IDs + importance ratings ──────────────────────────────

export const MatchRatingSchema = z.object({
  id: z.string().describe('Match ID from input'),
  importance: z.enum(['must_watch', 'high', 'medium', 'low']).describe('How important/exciting'),
});

export const MatchFinderResponseSchema = z.object({
  ids: z.array(MatchRatingSchema).describe('Rated matches, ordered by importance desc'),
});

export type MatchRating = z.infer<typeof MatchRatingSchema>;
export type MatchFinderResponse = z.infer<typeof MatchFinderResponseSchema>;
