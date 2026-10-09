# LOFICAGE

A free-for-all deathmatch you play in the browser. Share one link and up to 20 people drop into the same match.

- **Weapons:** AK-47, M4A1-S and AWP as main guns (pick one each life), with the Desert Eagle as a sidearm.
- **Gun feel modelled on CS2:** spray recoil patterns, accuracy only when you stand still, 4× headshots, armour penetration, damage falloff with range, an AWP that kills with one body shot, and a quieter M4A1-S.
- **Map:** *Sandline*, an original desert town with streets, tunnels through buildings, courtyards and raised platforms.
- **Matches:** 10 minutes, respawn after 2 seconds, most kills wins.
- **Bots** fill the match up to 10 players and leave as real people join.
- **Kick bots by vote:** once 2 or more real players are in, anyone can start a vote (Esc menu, or type `!kickbots` in chat). More than half the real players must vote yes. Bots come back with `!addbots`, or automatically when fewer than 2 real players remain.
- **Graphics:** PBR textures, sun shadows, ambient occlusion, colour grading, a painted sky with drifting clouds, and detailed architecture (parapets, roof beams, corner stones, balconies, arched tunnels, rooftop clutter, signs, washing lines, kerbs, sand drifts). Soldiers get a subtle edge highlight so they stay visible; it can be set to Off, Subtle or Strong.
- **Custom crosshair:** colour, length, thickness, gap, opacity, outline, centre dot, and dynamic or static style, with a live preview.
- **Extras:** text chat, kill feed, scoreboard, four soldier outfits, and offline practice against bots.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse / left click | Aim / shoot |
| Right click | AWP scope (two zoom levels) |
| Space | Jump |
| C or Ctrl | Crouch |
| Shift | Walk (no footstep sound) |
| R | Reload |
| 1 / 2 / 3 / Q / mouse wheel | Main gun / Deagle / knife / last weapon |
| Knife: left / right click / F | Slash / stab (backstabs hit harder) / inspect |
| F1 / F2 | Vote yes / no |
| B | Change main weapon |
| Tab | Scoreboard |
| Y | Chat |
| Esc | Menu: sensitivity, volume, graphics, field of view, crosshair editor, bot vote |

## How it works

| Part | What it is |
| --- | --- |
| `shared/` | Game rules used by both the server and the browser: map, movement physics, weapons, hit detection, bots and the match loop |
| `server/` | Node WebSocket server. It runs the authoritative match: it checks every shot (fire rate, ammo, position), rewinds players to account for lag, and applies damage |
| `src/` | Browser client built on Three.js: rendering, input, client-side prediction, interpolation of other players, effects, sound and HUD |

The server sends 20 snapshots a second. A full 20-player match uses about 2 ms of server CPU per tick and about 11 KB/s of download per player.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:5180. `npm run dev` starts the game server on port 2567 and the client on port 5180.

To load-test the server with 20 fake players:

```bash
npm run loadtest
```

## Deploy

**1. Game server on Render (free)**

1. Sign in at render.com with GitHub.
2. Choose New → Blueprint and select this repo. `render.yaml` sets up a free Node web service.
3. Copy the service URL, for example `https://loficage-server.onrender.com`.

**2. Game page on GitHub Pages**

```bash
node scripts/deploy-pages.mjs wss://loficage-server.onrender.com
```

This builds the client pointing at that server and pushes it to the `gh-pages` branch. In the repo settings, set Pages to serve the `gh-pages` branch.

The free Render server sleeps after about 15 minutes with nobody connected. The first player to open the page then waits 30–60 seconds while it wakes up; the page shows a "Waking up the server…" message during that time.

## Credits

- Textures: [Poly Haven](https://polyhaven.com), CC0.
- Guns, soldiers, effects and all sounds are generated in code. No assets come from Counter-Strike.
- LOFICAGE is an independent fan project and is not affiliated with Valve or Counter-Strike.
