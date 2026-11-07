# Project: Independent Browser Recreation of a GBA Falling-Block Puzzle Game

## 1. Project Objective

Create a complete, browser-playable recreation of the falling-block puzzle game contained in the supplied Game Boy Advance ROM (referred to throughout as **the reference game**):

`Tetris Worlds (USA).gba`

The objective is to reverse-engineer the original game's mechanics, rules, gameplay modes, progression, interface behavior, visual presentation, and sound design, then independently recreate the experience using modern JavaScript/TypeScript web technologies.

**This is NOT an emulator project.**

Do not simply port mGBA, embed a GBA emulator, execute the original ROM in the browser, or wrap an emulator in a web interface.

The result must be an independently implemented game engine and application that reproduces the original game's functionality and overall experience as accurately as practical.

The ROM is a reference for reverse engineering and behavioral analysis. It must not be required at runtime.

## 2. Copyright, Trademark, and Asset Requirements

These rules are mandatory and override any other instruction in this document. The reference game is used **only** to study rules, mechanics, timing, and structure. Nothing from it, and none of its names, may appear in the finished product.

### 2.1 Forbidden in everything you produce

This applies to the shipped game, its source code, file and folder names, package names, page titles, UI text, credits, README, CHANGELOG, TODO, commit messages, test names, and generated assets:

- **The word "Tetris"** in any form, spelling, capitalization, or abbreviation (including in compound words, puns, or near-homophones intended to evoke it). The generic geometric term "tetromino" is allowed in code and docs, but prefer "piece" in player-facing text.
- **Company and platform names:** do not name The Tetris Company, Nintendo, THQ, Radical Entertainment, Elorg, Blue Planet Software, or any other publisher, developer, licensor, or platform holder. Do not use "Game Boy", "Game Boy Advance", or "GBA" in player-facing text.
- **The reference game's title and mode names:** do not use its title or its original mode/world names in the UI or in branding. Give every mode, world, and menu an original name. Internal code may use plain mechanic descriptions (for example `modes/connected-blocks/`, `modes/square-building/`).
- **Logos, title screens, wordmarks, mascots, characters, or trade dress** of the reference game or any related product.
- **Original copyrighted assets of any kind:** graphics, sprites, tiles, backgrounds, palettes copied as a set, fonts, music, sound effects, voice samples, text/dialogue, and level or menu layouts copied pixel-for-pixel.

### 2.2 How to handle original assets

- Do not extract, decode, trace, sample, convert, or embed any graphics or audio from the ROM, not even as placeholders, temporary test data, or "reference" files in the repository.
- Do not trace over or color-pick from emulator screenshots to produce assets. Screenshots under `docs/reverse-engineering/screenshots/` are for behavior documentation only and must never be shipped, imported by the app, or used as source material for artwork.
- Do not transcribe or recreate the reference game's music or melodies, even approximately.
- The ROM must not be required, bundled, or loaded at runtime.

### 2.3 What to create instead

Generate **new, original** assets that are *similar in style*, not copies:

- Colorful, dimensional-looking blocks with your own bevels, highlights, and textures, evoking a polished early-2000s handheld puzzle game.
- Original backgrounds, themed world art, menu frames, icons, particle effects, and animations, created procedurally (Canvas/SVG/shaders) or authored by hand in code.
- Original music and sound effects with a similar *mood and function* (upbeat menu loop, energetic gameplay tracks, satisfying line-clear and drop sounds), composed or synthesized from scratch with Web Audio.
- An original game name, logo, and branding. Pick a name that is clearly distinct and does not reference or pun on the reference game's title or brand.
- Use freely licensed fonts (for example SIL Open Font License) and record their licenses.

Document every asset's provenance in `docs/asset-provenance.md`: what it is, how it was made (generator script, procedural code, or hand-authored), and its license. Any third-party asset must be under a license compatible with redistribution and must be listed there.

### 2.4 Research documents

Files under `/docs/reverse-engineering/` may describe the reference game's behavior, but must refer to it as "the reference game" or "the reference ROM" rather than by name. The ROM's file name may appear only where needed to locate the file. Do not paste extracted text, graphics, or audio into these documents.

Before declaring any milestone complete, search the repository (excluding the ROM file itself) for the forbidden names above and remove every occurrence.

The objective is a recognizable gameplay experience built entirely from original material, not a redistribution of the reference game's copyrighted or trademarked content.

## 3. Reverse Engineering Phase

Before substantial implementation, inspect the supplied ROM and establish a technical understanding of the game.

Use available tools, including mGBA, Ghidra, binary inspection tools, disassemblers, and custom scripts as appropriate.

Do not assume the game's internal structure or mechanics without verifying them.

### Investigate the following:

**ROM architecture**
- Identify the ROM size, header information, architecture, and relevant executable regions.
- Identify code, data, graphics references, sound data references, and game-state structures.
- Determine how the game initializes and manages gameplay.
- Identify relevant routines for input, randomization, scoring, level progression, and mode-specific rules.
- Identify whether game logic is shared between modes or implemented separately.

**Gameplay**
- Identify all game modes actually present in the GBA release.
- Determine the exact rules for each mode.
- Identify piece generation and randomization behavior.
- Determine rotation behavior, wall kicks, collision rules, gravity, lock delay, line clearing, and other movement mechanics.
- Identify scoring systems, level progression, difficulty changes, and special conditions.
- Investigate special blocks, connected blocks, fusion mechanics, and other mode-specific elements where applicable.
- Determine game-over, victory, and progression conditions.

**Game structure**
- Investigate menus and navigation.
- Determine how worlds, stages, challenges, and unlocks are organized.
- Identify available difficulty settings and progression requirements.
- Determine how saved progress and high scores work.
- Investigate multiplayer functionality and its requirements.

**Presentation**
- Determine screen layout, board dimensions, information panels, animation timing, and transitions.
- Understand how the original game communicates gameplay state to the player.
- Investigate music and sound-effect triggers, duration, and purpose without reusing the original recordings or compositions.

### Reverse Engineering Deliverables

Create a `/docs/reverse-engineering/` directory containing:

1. `rom-overview.md`
2. `game-modes.md`
3. `gameplay-mechanics.md`
4. `scoring-and-progression.md`
5. `game-state-architecture.md`
6. `menu-and-ui-analysis.md`
7. `audio-behavior.md`
8. `reverse-engineering-unknowns.md`

Document findings with ROM offsets, addresses, function references, screenshots from the reference emulator where useful, and confidence levels.

Distinguish verified findings from assumptions.

Do not spend unlimited time trying to understand every function before starting implementation. Establish a reliable foundation, implement a vertical slice, and continue reverse engineering as necessary.

### 3.1 Reference Emulator Access (mGBA + `mgba` MCP server)

mGBA 0.10.5 is installed at `/Applications/mGBA.app`. You can drive the running emulator through the **`mgba` MCP server**, which is already registered for this project in `.qwen/settings.json` (trusted, no per-call confirmation).

**How it connects**

```text
Qwen Code --stdio--> mcp-mgba (node $HOME/tools/mcp-mgba/dist/index.js, MGBA_PORT=8777)
          --TCP 127.0.0.1:8777--> bridge-8777.lua running inside mGBA
```

The bridge listens on port **8777**, not mcp-mgba's default 8765, because another service on this machine uses 8765. The `.qwen/settings.json` entry already sets `MGBA_PORT=8777`. Do not change the port.

The MCP server only works while mGBA is open with the ROM loaded **and** the Lua bridge running. You can start both yourself; no human step is needed.

**Startup procedure (run it yourself with the shell tool)**

1. `scripts/start-mgba.sh` launches mGBA with `Tetris Worlds (USA).gba` from the project root and loads the bridge automatically (takes about 5 seconds). It prints `Bridge listening on 127.0.0.1:8777` on success. Pass a ROM path as the first argument to use a different ROM.
2. Call `mgba_ping` (expects `pong`), then `mgba_get_info` (expects title `TETRISWORLDS`, code `AGB-ATWE`). These identifiers are only for verifying the emulator connection; do not copy them into the project.

If mGBA is already running but the bridge is not, run `scripts/load-bridge.sh`. It is safe to run either script again; they detect an existing mGBA and a bridge that is already listening.

How the automation works: `start-mgba.sh` adds the bridge to mGBA's "Load recent script" list in `~/.config/mgba/qt.ini` before launch, and `load-bridge.sh` uses macOS Accessibility (System Events) to click **Tools > Scripting… > File > Load recent script > bridge-8777.lua**. It sends no keystrokes and does not need mGBA to be the front window.

If a script fails, read its error message and try once more after `pkill -f mGBA.app/Contents/MacOS/mGBA`. If it still fails, do not keep retrying: tell the user what failed, then continue with offline work (static ROM analysis, documentation, implementation) until the emulator is available.

**Available tools**

| Tool | Use |
|------|-----|
| `mgba_ping` | Connectivity check |
| `mgba_get_info` | Game title, game code, frame count, bridge capabilities |
| `mgba_read8` / `mgba_read16` / `mgba_read32` | Read a value at an address |
| `mgba_read_range` | Read up to 4096 bytes (use for board state, RNG state, structs) |
| `mgba_write8` / `mgba_write16` / `mgba_write32` / `mgba_write_range` | Write RAM (set up test situations, force pieces/RNG) |
| `mgba_press_buttons` | Queue button presses (FIFO): `A`, `B`, `Select`, `Start`, `Right`, `Left`, `Up`, `Down`, `R`, `L` |
| `mgba_advance_frames` | Step N frames (deterministic timing measurements: gravity, lock delay, DAS/ARR, animation lengths). On mGBA 0.10.5 this falls back to `runFrame`/`step` internally |
| `mgba_pause` / `mgba_unpause` | **Not available on mGBA 0.10.5** (reported missing by `mgba_get_info`). Use savestates plus `mgba_advance_frames` for precise timing instead |
| `mgba_reset` | Reset the ROM |
| `mgba_screenshot` | Save a PNG of the current screen (pass a path under `docs/reverse-engineering/screenshots/` to keep it) |
| `mgba_save_state` / `mgba_load_state` | Snapshot and restore exact situations (slot or file path) |

**GBA memory map:** EWRAM `0x02000000` (256 KiB), IWRAM `0x03000000` (32 KiB), I/O `0x04000000`, palette `0x05000000`, VRAM `0x06000000`, OAM `0x07000000`, ROM `0x08000000`.

**Recommended workflow**

- **RAM hunting:** snapshot memory with `mgba_read_range`, perform one action (move a piece, clear a line, score points), snapshot again, diff. Repeat to isolate the board array, current piece, score, level, line count, and RNG state. Record addresses in `game-state-architecture.md`.
- **Reproducible experiments:** reach a situation, `mgba_save_state` to a file under `docs/reverse-engineering/states/`, then `mgba_load_state` before each trial so every comparison starts identically.
- **Timing:** load a savestate, then use `mgba_advance_frames` with `mgba_read_range`/`mgba_screenshot` between steps to count exact frames (60 fps).
- **Cross-reference with static analysis:** confirm addresses found at runtime against Ghidra/disassembly of the ROM, and cite both in the docs.
- Only one client can hold the bridge at a time. If two agents need the emulator, the coordinator must serialize access (one agent drives mGBA; the other requests experiments through the coordinator).
- Screenshots are for research and comparison only. Never ship them or anything extracted from them as game assets (see Section 2).

**Troubleshooting**

- `Cannot reach mGBA bridge at 127.0.0.1:8777`: mGBA isn't running or the bridge isn't loaded. Run `scripts/start-mgba.sh`.
- `bind failed`: a previous mGBA instance still holds the socket. Run `pkill -f mGBA.app/Contents/MacOS/mGBA`, then `scripts/start-mgba.sh`.
- Tool calls hang or return stale data after the bridge was loaded twice: quit mGBA and relaunch with `scripts/start-mgba.sh` (it loads the bridge exactly once).
- `load-bridge.sh` reports the bridge is not in the recent-scripts list: quit mGBA and relaunch through `scripts/start-mgba.sh`, which adds it.
- Accessibility error (`not allowed assistive access`): the user must grant Accessibility permission to the terminal app. Ask them; you cannot do this yourself.

## 4. Browser Application Requirements

Build a standalone browser application.

It must run locally and be usable through a normal desktop browser without an emulator, external game service, or original ROM at runtime.

### Technology selection

Evaluate and select appropriate JavaScript/TypeScript libraries.

Preferred starting point:

- TypeScript
- Vite
- HTML5 Canvas or PixiJS for 2D rendering
- Web Audio API for sound
- Howler.js if it materially simplifies audio management
- Vitest for unit testing
- Playwright for browser automation

You may choose different libraries if research demonstrates a better fit.

Avoid unnecessary frameworks and dependencies.

The game should be responsive, performant, and maintainable.

### Input support

Implement complete input support for:

**Keyboard**
- Left/right movement
- Soft drop
- Hard drop
- Rotate clockwise
- Rotate counterclockwise, where supported
- Hold, if supported by the original mode
- Pause
- Confirm/back/menu navigation

Allow configurable key bindings.

**Mouse**
- Clickable menus and buttons.
- Clickable gameplay controls where appropriate.
- Mouse-accessible navigation through all menus.
- Settings and configuration screens.

**Browser**
- Fullscreen support.
- Responsive scaling.
- Correct aspect ratio.
- Browser window resizing.
- Audio enable/disable and volume controls.
- No requirement for a particular desktop resolution.

Consider optional gamepad support, but keyboard and mouse are mandatory.

## 5. Gameplay Recreation

The game must reproduce the original GBA release's actual gameplay modes.

Do not implement only the standard falling-block mode and call the project complete.

Each mode must have its own verified rules, mechanics, objectives, scoring, and win/loss conditions.

Build a modular rules engine so that different modes can share common systems without becoming one giant collection of conditional statements.

Potential shared components include:

- Playfield management
- Tetromino generation
- Piece movement and rotation
- Collision detection
- Gravity and lock timing
- Line detection and clearing
- Scoring
- Level management
- Animation system
- Special block behavior
- Game-state transitions

Mode-specific rules must be independently testable.

Implement special mechanics based on reverse-engineering findings rather than assumptions based on other falling-block puzzle games.

## 6. Graphics and Animation

Create original graphics that capture the general presentation quality of a polished GBA-era puzzle game.

The visual experience should include:

- Colorful, dimensional-looking blocks.
- Distinctive but original block textures.
- Attractive backgrounds.
- Animated menus and transitions.
- Piece movement and rotation animations.
- Line-clear effects.
- Mode-specific visual effects.
- Particle effects where appropriate.
- Game-over and victory animations.
- Original UI elements.
- Clear typography and visual hierarchy.

Do not simply draw colored rectangles on a black background.

Use a consistent art direction throughout the game.

Prioritize legibility and accurate gameplay over unnecessary visual effects.

Support scaling without pixel distortion or blurry text.

## 7. Audio

Create an original audio experience.

Implement:

- Background music.
- Menu music.
- Gameplay music.
- Mode-specific musical variations where appropriate.
- Piece movement sounds.
- Rotation sounds.
- Drop sounds.
- Line-clear sounds.
- Special-mode effects.
- Victory and game-over sounds.
- Menu navigation sounds.

Use original compositions and sound effects. Do not reproduce the original game's melodies or recordings.

Use Web Audio API or an appropriate audio library.

Audio must:
- Respect browser autoplay restrictions.
- Initialize after user interaction.
- Support volume controls.
- Support mute.
- Avoid overlapping sound effects unnecessarily.
- Stop or transition appropriately when changing game states.

## 8. Architecture

Build the application using a clean separation of concerns.

Suggested structure:

```text
src/
  app/
    application.ts
    game-state.ts
    input-manager.ts
    settings.ts

  engine/
    game-loop.ts
    renderer.ts
    animation-manager.ts
    collision.ts
    randomizer.ts
    audio-manager.ts

  gameplay/
    board.ts
    piece.ts
    piece-manager.ts
    scoring.ts
    level-manager.ts
    game-session.ts

  modes/
    mode-registry.ts
    standard/
    <one-folder-per-verified-mode>/   # named after the mechanic, never the original mode name

  ui/
    menus/
    screens/
    components/
    overlays/

  assets/
    graphics/
    audio/
    fonts/

  tests/
    unit/
    integration/
    browser/
```

This is a suggested starting structure, not a mandatory design. Modify it based on actual reverse-engineering findings.

Do not assume that every listed mode is present in the ROM. Verify the actual release and adjust the implementation accordingly.

Keep gameplay rules independent of rendering so that they can be tested without a browser.

## 9. Two-Agent Development Strategy

Use two Qwen Code agents concurrently wherever possible.

### Agent 1: Reverse Engineering and Game Research

Responsibilities:

- Analyze the ROM.
- Identify game modes and their rules.
- Investigate scoring and progression.
- Identify gameplay algorithms and state transitions.
- Document relevant code and data structures.
- Compare behavior against the reference game in mGBA.
- Produce technical specifications for the implementation agent.
- Validate implementation behavior against the original.

Deliver findings as documentation and focused technical reports.

Do not modify the core application architecture without coordinating with the implementation agent.

### Agent 2: Browser Game Development

Responsibilities:

- Establish the TypeScript/Vite project.
- Design the application architecture.
- Build the rendering engine.
- Implement the core falling-block engine.
- Implement gameplay modes as their mechanics are verified.
- Create original graphics and animations (see Section 2).
- Implement original audio (see Section 2).
- Build menus and progression systems.
- Write unit, integration, and browser tests.

Do not invent mode mechanics when the research agent has not verified them.

### Coordination

The primary Qwen Code session acts as project coordinator.

It must:

- Maintain a shared task list.
- Review agent findings.
- Resolve conflicting interpretations.
- Keep architecture consistent.
- Prevent duplicate work.
- Integrate completed features.
- Require tests before accepting major changes.

Use separate branches or clearly separated work areas if needed.

Do not allow both agents to modify the same core files concurrently without coordination.

## 10. Testing and Validation

Testing is a major part of this project.

Create automated tests for:

- Piece movement.
- Rotation.
- Wall collisions.
- Floor collisions.
- Gravity.
- Lock behavior.
- Line clearing.
- Scoring.
- Level progression.
- Randomizer behavior.
- Special block mechanics.
- Mode-specific rules.
- Game-over conditions.
- Victory conditions.
- Save/load behavior.

Use reference-game comparisons wherever possible.

For important mechanics:

1. Set up a reproducible situation in the original game.
2. Record the expected behavior.
3. Reproduce the same situation in the browser game.
4. Compare results.
5. Document discrepancies.
6. Correct the implementation.

Include deterministic test scenarios with fixed random seeds.

Use Playwright to test the actual browser experience, not just isolated game logic.

## 11. Save System

Implement persistent browser storage for:

- Unlocked content.
- Progression.
- High scores.
- Settings.
- Key bindings.
- Audio preferences.

Use IndexedDB or localStorage as appropriate.

The game should recover saved progress after closing and reopening the browser.

Provide a reset-progress option with confirmation.

## 12. Development Milestones

Work in the following order.

### Milestone 1 — Research Foundation
- Verify ROM and game version.
- Establish reverse-engineering environment.
- Identify all game modes.
- Document core mechanics.
- Create the initial project structure.

### Milestone 2 — Playable Core
- Render a playable board.
- Implement pieces, movement, rotation, gravity, and collision.
- Implement line clearing.
- Implement scoring.
- Add keyboard and mouse support.
- Create basic original graphics and audio.

At the end of this milestone, the game must be playable.

### Milestone 3 — Game Modes
- Implement every verified mode.
- Reproduce their distinct rules.
- Add mode-specific scoring and objectives.
- Validate each against the reference game.

### Milestone 4 — Complete Game Structure
- Implement menus.
- Implement worlds and progression.
- Implement unlocks and challenges.
- Implement high scores and persistence.
- Implement difficulty and configuration.

### Milestone 5 — Presentation
- Complete original artwork.
- Complete original music and sound effects.
- Add animations and transitions.
- Improve responsive design.
- Implement fullscreen.

### Milestone 6 — Final Validation
- Test all gameplay modes.
- Test all menu paths.
- Test persistence.
- Test browser compatibility.
- Fix crashes, softlocks, and gameplay discrepancies.
- Profile performance.
- Produce a final release build.

## 13. Quality Requirements

The finished game must:

- Be playable from beginning to end.
- Include all verified game modes.
- Have complete keyboard support.
- Have complete mouse-accessible menus.
- Run in modern desktop browsers.
- Work without the original ROM at runtime.
- Use original replacement graphics and audio.
- Preserve the essential gameplay rules and progression.
- Have no placeholder menus or nonfunctional buttons.
- Have no major gameplay bugs.
- Include documentation and automated tests.
- Be straightforward to install and run locally.

Do not claim completion merely because the standard mode works.

## 14. Autonomous Development Expectations

Work proactively.

Do not stop after producing a plan or a basic prototype.

When a technical obstacle occurs:

1. Investigate it.
2. Try reasonable alternatives.
3. Document the problem.
4. Continue with independent work where possible.
5. Return to blocked tasks when new information becomes available.

Do not repeatedly retry failed operations without changing the approach.

Avoid unnecessary questions. Make reasonable technical decisions, document them, and continue.

Keep the project runnable throughout development.

Maintain:

- `README.md`
- `TODO.md`
- `CHANGELOG.md`
- `/docs/`
- Automated tests

Update TODO.md as work progresses.

At the end of each major milestone, provide a report containing:
- What was completed.
- What was reverse-engineered.
- What remains incomplete.
- Known discrepancies from the original.
- Test results.
- Recommended next steps.

## 15. First Actions

Begin by inspecting the current working directory and locating:

`Tetris Worlds (USA).gba`

Do not assume the file is in the project root.

If the ROM cannot be found, report that clearly rather than silently substituting another ROM.

Then:

1. Verify the ROM.
2. Inspect the repository and installed development tools.
3. Check whether mGBA, Ghidra, and useful GBA analysis tools are available. For mGBA, follow Section 3.1 and confirm the `mgba` MCP server answers `mgba_ping`.
4. Establish the reverse-engineering workflow.
5. Launch the two-agent work plan.
6. Create the initial documentation.
7. Begin implementing the playable core.

**The ultimate goal is a faithful, independently implemented browser recreation of the reference game's gameplay, with original name, art, and audio. It is not a generic falling-block clone and not an emulator.**

Prioritize verified gameplay fidelity, complete functionality, and a polished user experience.
