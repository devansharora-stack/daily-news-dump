const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Definitive "this page does not exist" statuses. 403/429/5xx are treated as
// alive (bot-blocking or transient on a real page — they open fine in a browser).
const DEAD_STATUS = new Set([404, 410, 451]);

// Returns true unless the URL is provably dead (hard 404/410/451 or DNS/connection
// failure). Timeouts and bot-blocks are treated as alive so we don't discard real pages.
export async function isUrlAlive(url) {
  if (!url) return false;

  const opts = {
    redirect: "follow",
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
  };

  try {
    let res = await fetch(url, { ...opts, method: "HEAD", signal: AbortSignal.timeout(12000) });
    // Some servers don't support HEAD — retry with GET before judging.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { ...opts, method: "GET", signal: AbortSignal.timeout(15000) });
    }
    return !DEAD_STATUS.has(res.status);
  } catch (err) {
    // Timeout/abort → keep (slow but likely real). DNS/connection error → dead.
    return err.name === "TimeoutError" || err.name === "AbortError";
  }
}
