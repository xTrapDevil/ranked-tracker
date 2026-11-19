# Ranked Tracker

A small website that tracks a group of friends' Valorant ranked stats in one place: current rank, ranked wins and games for the act, wins per week, streaks, duo records and weekly awards.

**Live site:** https://ranked-tracker.vercel.app

## Features

- **Leaderboard**: each player's current act, rank and RR, ranked wins, games played and win %, sortable by win %, wins, games or name. Valorant stats refresh every time the page opens.
- **Rank ladder**: players ordered from highest rank to lowest (ties broken by RR), with rank icons, the RR change from their last game and their peak rank.
- **Ranked wins per week**: a table of wins and W–L records per player per week (Monday 12:00 AM to Sunday 11:59 PM Pacific), with a total column, an "Everyone" row and a choice of 4, 6, 8 or 12 weeks.
- **Fix a week**: lets the owner correct a week's record by hand when the match history is missing games. A corrected cell shows a ✎ mark.
- **Streaks**: 🔥 and 🧊 badges for 2+ wins or losses in a row.
- **Duos**: record and win % for every pair of players who queued together, plus how often they faced each other.
- **Weekly awards**: most wins, best win rate (5+ games), longest win streak and most games, for this week or last week.
- **Since last visit**: each player's wins and losses since you last opened the site.
- **Phone layout**: tables turn into cards on small screens.
- **Other games**: League, CS2, Marvel Rivals, Overwatch 2 or any tracker.gg profile can be added with stats typed in by hand.

## How it works

```
Browser (index.html)
   │  reads the player list from data.json
   │  calls /api/stats for each Valorant player
   ▼
Vercel serverless function (api/stats.js)
   │  adds the secret API key
   ▼
HenrikDev Valorant API (unofficial, reads Riot's game data)
```

- `api/stats.js` keeps the HenrikDev API key on the server, so visitors never see it. Responses are cached at Vercel's edge for 5 minutes to stay under the key's rate limit.
  - `/api/stats?name=NAME&tag=TAG&region=na` returns current rank, RR, peak rank and wins/games per act.
  - `/api/stats?view=weekly&name=NAME&tag=TAG&region=na` returns recent competitive games with dates and results.
- Rank icons are loaded from [valorant-api.com](https://valorant-api.com).
- Tracker.gg has no public Valorant API, so the site links to each player's tracker.gg profile instead of reading from it.

## Project structure

```
index.html      The whole site: layout, styles and all page logic
api/stats.js    Serverless function that calls the HenrikDev API
data.json       The published player list and any weekly corrections
```

## Setup

1. **Get a HenrikDev API key.** Join the HenrikDev Discord, verify, go to `#get-a-key` and choose "VALORANT (Basic Key)".
2. **Deploy to Vercel.** Import this repo at [vercel.com/new](https://vercel.com/new) with the default settings. No build step is needed.
3. **Add the key.** In the Vercel project, open **Settings → Environment Variables** and add:

   | Key | Value |
   |---|---|
   | `HENRIK_API_KEY` | your HenrikDev key (starts with `HDEV-`) |

4. **Redeploy** so the key takes effect (Deployments → ⋯ → Redeploy).

## Adding or removing players

The player list lives in `data.json`, so everyone who opens the site sees the same players.

1. On the site, click **Add player** and enter the Riot ID (like `Name#TAG`) and region.
2. Click **Publish changes → Copy**.
3. In GitHub, open `data.json`, click the pencil icon, select everything, paste and commit.
4. Vercel redeploys in about a minute.

The same steps publish edits, deletions and weekly corrections.

## Known limitations

- **HenrikDev is unofficial.** If it goes down or Riot changes something, stats stop updating until it's back.
- **Older weeks can be missing games.** HenrikDev only saves a player's matches when someone looks them up, and it skips any match it fails to download. Recent weeks are usually complete because the site checks every player on each visit. Use **Fix a week** to correct anything that doesn't match tracker.gg.
- **"Since last visit" is per browser.** It's stored in each visitor's own browser.
- **Win %** is wins ÷ games played, so draws count as not won.

## Credits

- Valorant data: [HenrikDev API](https://docs.henrikdev.xyz)
- Rank icons: [valorant-api.com](https://valorant-api.com)
- Player profiles: [tracker.gg](https://tracker.gg/valorant)

Ranked Tracker isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, VALORANT and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
