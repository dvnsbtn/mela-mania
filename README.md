# Mini Games Showdown

Teams join on their phones with a session code, play six timed mini games, and the host console adds up every team's time. Lowest total wins.

- **Players:** `/` — enter code + team name
- **Host console:** `/admin` — password `host123` by default (set `ADMIN_PASSWORD` to change it)

No npm install needed. Just Node 18+.

## Run it

### Option A — on your laptop (everyone on the same Wi-Fi)

```bash
node server.js
```

Open `http://localhost:3000/admin`. The join screen automatically shows your laptop's Wi-Fi address and a QR code for players.

> Office Wi-Fi sometimes blocks phone-to-laptop traffic. If players can't connect, use Option B.

### Option B — free public link on Render (works on any network / mobile data)

1. Put this folder in a GitHub repo.
2. On render.com: **New → Blueprint**, pick the repo (it reads `render.yaml`).
3. Set `ADMIN_PASSWORD` when prompted.
4. Open `https://<your-app>.onrender.com/admin`.

Free Render apps sleep after inactivity — open the admin page ~2 minutes before the event so it's awake.

## Running the event

| Screen | Key | What it's for |
|---|---|---|
| Join screen | `J` | Code, QR, live list of teams (hover a team → ✕ to remove) |
| Rounds | `R` | Set each game's time limit and start it |
| Live round | `L` | Big countdown + every team's progress, opens automatically on start |
| Leaderboard | `B` | Podium + per-game times + totals |
| Present mode | `P` / `Esc` | Hides the sidebar and host buttons for clean screen sharing |

Typical flow: Join screen → Rounds → Start round → (Live view) → round ends when everyone finishes or time runs out → Show leaderboard → Next round.

## Scoring

Each round's time = seconds from round start to finishing + penalties − bonuses. Totals are summed across rounds.

| Situation | Effect (editable in Settings) |
|---|---|
| Didn't finish / ran out of tries / time up | Time limit + 60s |
| Hangman: run out of lives on a word | +30s, move to next word |
| Strands: hint | +30s |
| Krillion: skip or 30s prompt timeout | +10s |
| Krillion: rare ("deep") / very rare ("abyss") answer | −5s / −10s |
| Rapid Fire: skip | +15s |

## Changing puzzles

Host console → **Puzzles**. Each game has a simple text format with instructions beside it. Strands builds its grid for you (letters must total exactly 48). Answers stay on the server, so players can't peek.

Game state is saved to `data/state.json`, so a restart doesn't lose teams or times. Delete that file to start completely fresh.
