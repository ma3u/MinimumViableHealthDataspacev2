import type { Response } from "express";

// A pull (routes/dataspace.ts) hands its request to the dataset's own route by
// running it through the app a second time. The log line and the rate limits
// counted it on the way in, so the second pass skips them (#881, finding 15).

const KEY = "redispatched";

export function markRedispatched(res: Response): void {
  res.locals[KEY] = true;
}

export function isRedispatched(res: Response): boolean {
  return res.locals?.[KEY] === true;
}
