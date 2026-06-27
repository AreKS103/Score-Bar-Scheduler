/**
 * Parse TheSportsDB combat-sport event titles into card + fighter names.
 * Shared by events route and verification scripts.
 */

export function parseSDBFightEvent(
  strEvent: string,
  sportsdbId: string,
): { cardName: string; home: string; away: string } {
  const colonVsMatch = strEvent.match(/^(.+?):\s*(.+?)\s+vs\.?\s+(.+)$/i);
  if (colonVsMatch) {
    return {
      cardName: colonVsMatch[1].trim(),
      home: colonVsMatch[2].trim(),
      away: colonVsMatch[3].trim(),
    };
  }

  const vsMatch = strEvent.match(/^(.+?)\s+vs\.?\s+(.+)$/i);

  if (!vsMatch) {
    return { cardName: strEvent, home: strEvent, away: '' };
  }

  const leftPart = vsMatch[1].trim();
  const away = vsMatch[2].trim();

  if (sportsdbId === '4443') {
    const ufcCardMatch = leftPart.match(/^(UFC\s+(?:Fight Night\s+)?\d+)\s+(.+)$/i);
    if (ufcCardMatch) {
      return { cardName: ufcCardMatch[1].trim(), home: ufcCardMatch[2].trim(), away };
    }
    return { cardName: 'UFC', home: leftPart, away };
  }

  const boxingCardMatch = leftPart.match(
    /^(Zuffa Boxing\s+\d+|Night of Champions\s+[\w]+|Top Rank\s+[\w\s]+|Matchroom\s+[\w\s]+)\s+(.+)$/i,
  );
  if (boxingCardMatch) {
    return { cardName: boxingCardMatch[1].trim(), home: boxingCardMatch[2].trim(), away };
  }

  return { cardName: '', home: leftPart, away };
}
