import type { SessionResult } from "../store/gameStore";

export function getLocalDayResults(
  results: SessionResult[],
  date = new Date()
): SessionResult[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  return results.filter((result) => {
    if (!Number.isFinite(result.ts)) return false;
    const timestamp = new Date(result.ts);
    return (
      timestamp.getFullYear() === year &&
      timestamp.getMonth() === month &&
      timestamp.getDate() === day
    );
  });
}
