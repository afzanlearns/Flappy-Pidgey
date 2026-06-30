# 🐦 Flappy Pidgey — Catch 'em All Edition

> A Pokémon-themed endless flyer built for Instagram bio links.  
> Fly. Score. Encounter wild Pokémon. Catch them all.

<br/>

## What is this?

A browser game designed around one constraint: **someone clicks your Instagram bio link and has 5 minutes.**

The loop is immediate — tap to flap, dodge pipes, hit a score threshold, and a wild Pokémon appears. Throw a Pokéball. Catch it or don't. Keep flying. Your Pokédex fills up across every run, saved to your browser, giving people a reason to come back.

No loading screen. No account. No install. Just open and play.

<br/>

## How to play

**Open `index.html` in any browser.** That's it. No server, no build step, no npm.

> Since the game loads sprites from PokéAPI's CDN, you'll need an internet connection — which is expected for a bio link anyone opens on their phone.

**Controls**

| Action | Input |
|---|---|
| Flap | Tap / Click / Space / ↑ |
| Throw Pokéball | Tap / Click / Space when the ring appears |

<br/>

## The game loop

```
Fly through pipes → score points
         ↓
  Hit a threshold
         ↓
  Wild Pokémon appears
  (1-in-20 chance it's Shiny ✨)
         ↓
  Tap when the ring is small
  for a better throw
         ↓
  90–99% catch chance
         ↓
  Pokédex entry saved
         ↓
  Keep flying
```

First encounter triggers at **score 8** so the hook lands within seconds. After that, encounters scale gradually — every 14 to 40 points, with the gap growing as you get further so the pacing feels intentional rather than random.

Difficulty also ramps: pipe speed increases and gap between pipes narrows as your score climbs, keeping the skill ceiling high enough that a good player is always being challenged.

<br/>

## Pokémon

All **151 original Kanto Pokémon** are in the draw pool, using their real names and types. Sprites are loaded directly from [PokéAPI's public sprite repository](https://github.com/PokeAPI/sprites) — the actual official pixel-art artwork, the same sprites from the original games.

**Pull rates**

| Category | Rate |
|---|---|
| Regular Pokémon (146 species) | ~97% |
| Legendary (Articuno, Zapdos, Moltres, Mewtwo, Mew) | ~3% |
| Shiny variant (any encounter) | 1 in 20 |

The shiny rate is deliberately generous compared to the main games (1/8192) because this is a 5-minute experience — people should actually see a shiny, feel the excitement, and want to come back for more.

**Pokédex**

Progress saves to `localStorage` across sessions. The Pokédex shows every caught Pokémon with their real sprite, and highlights shiny catches with a gold border. Uncaught entries show `?` and the Pokédex number.

<br/>

## Sharing it

The cleanest path to a bio link is **Netlify Drop**:

1. Unzip the folder
2. Drag the `flappy-pidgey` folder onto [app.netlify.com/drop](https://app.netlify.com/drop)
3. Get a live `https://` URL in about 10 seconds

Alternatively:

- **GitHub Pages** — push to a repo, enable Pages under Settings → Pages → main branch `/root`. URL becomes `yourusername.github.io/repo-name`
- **Vercel** — drag and drop at [vercel.com/new](https://vercel.com/new)

All three are free and give you a proper `https://` URL suitable for an Instagram bio.

<br/>

## Project structure

```
flappy-pidgey/
├── index.html          # Everything — game canvas, all UI screens, styles
└── js/
    ├── game.js         # Core engine: physics, flap loop, encounter flow,
    │                   # throw minigame, Pokédex modal, particles
    ├── pokedex-data.js # All 151 Pokémon: names, types, weighted random draw
    ├── sprite-forge.js # Async sprite loader from PokéAPI CDN, cache layer,
    │                   # preloading, shiny aura overlay, graceful fallback
    └── save-data.js    # localStorage persistence: dex progress, best score,
                        # catch/encounter stats, shiny count
```

No framework. No build toolchain. No bundler. Plain JavaScript, plain Canvas 2D, one Google Font. The whole thing loads in under a second on a phone.

<br/>

## Technical notes

**Sprite loading**  
Sprites load asynchronously from `raw.githubusercontent.com/PokeAPI/sprites`. The 15 most common early-game Pokémon preload on startup so early encounters feel instant. Everything else loads on demand and shows a spinning placeholder until the image arrives. Shiny sprites fall back to normal sprites on network error rather than breaking.

**Persistence**  
Game state is serialized to a single `localStorage` key (`flappy_pidgey_save_v1`). The schema is forward-compatible — new fields added in updates deep-merge with existing saves rather than wiping them.

**Physics**  
Fixed-timestep update capped at 33ms per frame to prevent spiral-of-death on tab-switch. Gravity, flap velocity, and max fall speed are tuned for a ~1.5 second fall from the top of screen to ground — the classic Flappy Bird feel.

**Catch formula**  
Base 90% catch rate (inspired by Pokémon GO's encounter mechanic) with a timing bonus of up to +9% for landing the throw inside the smallest ring radius. Catch chance is always capped at 99% — misses are possible but rare, preserving tension without feeling unfair.

<br/>

## Credits

- Pokémon sprites © Nintendo / Game Freak, served via [PokéAPI](https://pokeapi.co)
- This is a non-commercial fan tribute. All Pokémon names and imagery are property of their respective owners.
