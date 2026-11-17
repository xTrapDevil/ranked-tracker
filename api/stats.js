// Vercel serverless function for the Ranked Tracker.
//   GET /api/stats?name=Name&tag=TAG&region=na&platform=pc            -> current rank + wins/games per act
//   GET /api/stats?view=weekly&name=Name&tag=TAG&region=na            -> recent competitive games with dates and results
// Data comes from the HenrikDev Valorant API. The key lives in the HENRIK_API_KEY
// environment variable, so visitors never see it.

const REGIONS = new Set(["na", "eu", "ap", "kr", "latam", "br"]);

function send(res, status, body, cache) {
  res.setHeader("Cache-Control", cache || "no-store");
  res.status(status).json(body);
}

async function henrik(url, key) {
  let up;
  try {
    up = await fetch(url, { headers: { Authorization: key, Accept: "application/json" } });
    if (up.status === 401 || up.status === 403) {
      // HenrikDev also accepts the key as a query parameter.
      const sep = url.includes("?") ? "&" : "?";
      up = await fetch(`${url}${sep}api_key=${encodeURIComponent(key)}`, { headers: { Accept: "application/json" } });
    }
  } catch (e) {
    return { error: [502, "upstream_down", "Couldn't reach HenrikDev. Try again in a minute."] };
  }
  let body = null;
  try { body = await up.json(); } catch (e) { body = null; }
  if (up.ok && body && body.data) return { data: body.data };
  if (up.status === 404) return { error: [404, "not_found", "Riot ID not found. Check the name, tag and region.", "s-maxage=600"] };
  if (up.status === 429) return { error: [429, "rate_limited", "HenrikDev is rate limiting. Stats will load again in a minute."] };
  if (up.status === 401 || up.status === 403) return { error: [502, "bad_key", "HenrikDev rejected the API key. Check HENRIK_API_KEY in Vercel, then redeploy."] };
  return { error: [502, "upstream_error", `HenrikDev returned an error (${up.status}). Try again later.`] };
}

function ranked(d, fallbackName, fallbackTag) {
  const cur = d.current || {};
  const seasons = (Array.isArray(d.seasonal) ? d.seasonal : []).map(s => ({
    id: s.season && s.season.id ? String(s.season.id) : "",
    act: s.season && s.season.short ? String(s.season.short) : "",
    wins: Number.isInteger(s.wins) ? s.wins : 0,
    games: Number.isInteger(s.games) ? s.games : 0,
    endRank: s.end_tier && s.end_tier.name ? String(s.end_tier.name) : null,
    endRR: Number.isInteger(s.end_rr) ? s.end_rr : null
  }));
  return {
    name: d.account && d.account.name ? d.account.name : fallbackName,
    tag: d.account && d.account.tag ? d.account.tag : fallbackTag,
    rank: cur.tier && cur.tier.name ? cur.tier.name : null,
    rr: Number.isInteger(cur.rr) ? cur.rr : null,
    lastChange: Number.isInteger(cur.last_change) ? cur.last_change : null,
    gamesNeeded: Number.isInteger(cur.games_needed_for_rating) ? cur.games_needed_for_rating : null,
    peak: d.peak && d.peak.tier ? { rank: d.peak.tier.name || null, act: d.peak.season && d.peak.season.short ? d.peak.season.short : null } : null,
    seasons,
    fetchedAt: new Date().toISOString()
  };
}

function weekly(list) {
  const games = [];
  for (const m of Array.isArray(list) ? list : []) {
    const meta = m && m.meta ? m.meta : {}, st = m && m.stats ? m.stats : {}, teams = m && m.teams ? m.teams : {};
    const raw = meta.started_at;
    const start = typeof raw === "number" ? new Date(raw < 1e12 ? raw * 1000 : raw) : new Date(raw);
    if (Number.isNaN(start.getTime())) continue;
    const team = String(st.team || "").toLowerCase();
    let result = null;
    if ((team === "red" || team === "blue") && Number.isInteger(teams.red) && Number.isInteger(teams.blue)) {
      const mine = team === "red" ? teams.red : teams.blue, theirs = team === "red" ? teams.blue : teams.red;
      result = mine > theirs ? "W" : mine < theirs ? "L" : "D";
    }
    if (!result) continue;
    games.push({
      id: meta.id ? String(meta.id) : "",
      start: start.toISOString(),
      result,
      score: `${team === "red" ? teams.red : teams.blue}-${team === "red" ? teams.blue : teams.red}`,
      map: meta.map && meta.map.name ? String(meta.map.name) : null,
      agent: st.character && st.character.name ? String(st.character.name) : null,
      act: meta.season && meta.season.short ? String(meta.season.short) : null
    });
  }
  return { games, fetchedAt: new Date().toISOString() };
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const key = process.env.HENRIK_API_KEY;
  if (!key) return send(res, 500, { error: "missing_key", message: "HENRIK_API_KEY isn't set in Vercel. Add it under Settings > Environment Variables, then redeploy." });

  const name = String(q.name || "").trim();
  const tag = String(q.tag || "").trim().replace(/^#/, "");
  const region = String(q.region || "na").trim().toLowerCase();
  const platform = String(q.platform || "pc").trim().toLowerCase() === "console" ? "console" : "pc";
  if (!name || !tag || name.length > 32 || tag.length > 8) return send(res, 400, { error: "bad_id", message: "Use a Riot ID like Name#TAG." });
  if (!REGIONS.has(region)) return send(res, 400, { error: "bad_region", message: "Region must be one of: na, eu, ap, kr, latam, br." });

  const n = encodeURIComponent(name), t = encodeURIComponent(tag);
  const isWeekly = q.view === "weekly";
  const url = isWeekly
    ? `https://api.henrikdev.xyz/valorant/v1/stored-matches/${region}/${n}/${t}?mode=competitive&size=150`
    : `https://api.henrikdev.xyz/valorant/v3/mmr/${region}/${platform}/${n}/${t}`;

  const out = await henrik(url, key);
  if (out.error) {
    const [status, error, message, cache] = out.error;
    return send(res, status, { error, message }, cache);
  }
  // Cache at Vercel's edge for 5 minutes so repeat visits don't use up the key's rate limit.
  send(res, 200, isWeekly ? weekly(out.data) : ranked(out.data, name, tag), "s-maxage=300, stale-while-revalidate=900");
};
