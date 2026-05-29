import { z } from 'zod';

// ── Structured candidate sent TO the AI (input) ─────────────────────────────
// Compact field names keep token usage low while still giving the model
// enough context (date, time, league, round, source) to make accurate calls.

export const MatchCandidateSchema = z.object({
  id: z.string().describe('Compact numeric ID assigned client-side'),
  t: z.string().describe('Title: "Home v Away" or event name'),
  l: z.string().describe('League abbreviation (e.g. EPL, NBA, MGP)'),
  c: z.string().optional().describe('Category (e.g. Football, Motorsport)'),
  d: z.string().describe('Local date YYYY-MM-DD'),
  tm: z.string().optional().describe('Local time HH:mm'),
  r: z.string().optional().describe('Round, stage, or session name'),
  s: z.string().optional().describe('Source provider (espn, sportsdb, openf1, manual)'),
  sel: z.boolean().optional().describe('User already added this to schedule'),
});
export type MatchCandidate = z.infer<typeof MatchCandidateSchema>;

// Back-compat alias for older imports.
export const MatchInputSchema = MatchCandidateSchema;
export type MatchInput = MatchCandidate;

// ── AI response: IDs + importance + optional one-line reason ────────────────

export const MatchRatingSchema = z.object({
  // z.coerce.string() accepts both string "5" and integer 5 — Groq returns numeric IDs
  id: z.coerce.string().describe('Match ID from input'),
  importance: z.enum(['must_watch', 'high', 'medium', 'low']).describe('How important/exciting'),
  reason: z.string().max(140).optional().describe('Short why-it-matters note'),
});

export const MatchFinderResponseSchema = z.object({
  ids: z.array(MatchRatingSchema).describe('Rated matches, ordered by importance desc'),
});

export type MatchRating = z.infer<typeof MatchRatingSchema>;
export type MatchFinderResponse = z.infer<typeof MatchFinderResponseSchema>;
