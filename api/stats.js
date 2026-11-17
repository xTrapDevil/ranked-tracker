// Vercel serverless function: GET /api/stats?name=Name&tag=TAG&region=na&platform=pc
// Looks up a player's ranked stats from the HenrikDev Valorant API.
// The API key lives in the HENRIK_API_KEY environment variable, so visitors never see it.

const REGIONS = new Set(["na", "eu", "ap", "kr", "latam", "br"]);

function fail(res, status, error, message, cache) {
  res.setHeader("Cache-Control", cache || "no-store");
  res.status(status).json({ error, message });
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const key = process.env.HENRIK_API_KEY;
  if (!key) {
    return fail(res, 500, "missing_key", "HENRIK_API_KEY isn't set in Vercel. Add it under Settings > Environment Variables, then redeploy.");
  }

  const name = String(q.name || "").trim();
  const tag = String(q.tag || "").trim().replace(/^#/, "");
  const region = String(q.region || "na").trim().toLowerCase();
  const platform = String(q.platform || "pc").trim().toLowerCase() === "console" ? "console" : "pc";

  if (!name || !tag || name.length > 32 || tag.length > 8) {
    return fail(res, 400, "bad_id", "Use a Riot ID like Name#TAG.");
  }
  if (!REGIONS.has(region)) {
    return fail(res, 400, "bad_region", "Region must be one of: na, eu, ap, kr, latam, br.");
  }

  const base = `https://api.henrikdev.xyz/valorant/v3/mmr/${region}/${platform}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;

  let upstream;
  try {
    upstream = await fetch(base, { headers: { Authorization: key, Accept: "application/json" } });
    if (upstream.status === 401 || upstream.status === 403) {
      // HenrikDev also accepts the key as a query parameter.
      upstream = await fetch(`${base}?api_key=${encodeURIComponent(key)}`, { headers: { Accept: "application/json" } });
    }
  } catch (e) {
    return fail(res, 502, "upstream_down", "Couldn't reach HenrikDev. Try again in a minute.");
  }

  let body = null;
  try { body = await upstream.json(); } catch (e) { body = null; }

  if (!upstream.ok || !body || !body.data) {
    if (upstream.status === 404) return fail(res, 404, "not_found", "Riot ID not found. Check the name, tag and region.", "s-maxage=600");
    if (upstream.status === 429) return fail(res, 429, "rate_limited", "HenrikDev is rate limiting. Stats will load again in a minute.");
    if (upstream.status === 401 || upstream.status === 403) return fail(res, 502, "bad_key", "HenrikDev rejected the API key. Check HENRIK_API_KEY in Vercel, then redeploy.");
    return fail(res, 502, "upstream_error", `HenrikDev returned an error (${upstream.status}). Try again later.`);
  }

  const d = body.data;
  const cur = d.current || {};
  const seasons = (Array.isArray(d.seasonal) ? d.seasonal : []).map(s => ({
    id: s.season && s.season.id ? String(s.season.id) : "",
    act: s.season && s.season.short ? String(s.season.short) : "",
    wins: Number.isInteger(s.wins) ? s.wins : 0,
    games: Number.isInteger(s.games) ? s.games : 0,
    endRank: s.end_tier && s.end_tier.name ? String(s.end_tier.name) : null,
    endRR: Number.isInteger(s.end_rr) ? s.end_rr : null
  }));

  // Cache at Vercel's edge for 5 minutes so repeat visits don't use up the API key's rate limit.
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
  res.status(200).json({
    name: d.account && d.account.name ? d.account.name : name,
    tag: d.account && d.account.tag ? d.account.tag : tag,
    rank: cur.tier && cur.tier.name ? cur.tier.name : null,
    rr: Number.isInteger(cur.rr) ? cur.rr : null,
    lastChange: Number.isInteger(cur.last_change) ? cur.last_change : null,
    gamesNeeded: Number.isInteger(cur.games_needed_for_rating) ? cur.games_needed_for_rating : null,
    peak: d.peak && d.peak.tier ? { rank: d.peak.tier.name || null, act: d.peak.season && d.peak.season.short ? d.peak.season.short : null } : null,
    seasons,
    fetchedAt: new Date().toISOString()
  });
};
