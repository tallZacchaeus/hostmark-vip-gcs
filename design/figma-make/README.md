# Figma Make export — "Hostmark VIP Coordination System"

This folder keeps the **original design prototype** the app's frontend was ported from. It is reference material only: nothing here is built, type-checked or deployed.

| Item | Value |
|---|---|
| Source file | `Hostmark VIP Coordination System.zip` (from Figma Make, exported 2026-10-17; gitignored because of its size) |
| Inside the zip | `….make` → `make_repos/1g5687b.zip` → git packfiles of the Make project |
| Commit exported | `3f9574289eddf883127bf5395d362b936400dd91` (`main`, "prompt: 500") |
| Stack of the prototype | Vite 8 + React 19 + Tailwind CSS 4, one `src/App.tsx` (~2,500 lines) and one `src/index.css` (~2,200 lines), sample data only |

## What was left out of `source/`

- Three empty files with names like `{const` (debris from a shell command inside Figma Make).
- `.figma/make/*` helper scripts (Figma's own dev/deploy hooks); only `site.json` (title, description, robots) is kept, in `.figma-make/`.
- `AGENTS.md` / `CLAUDE.md`: they describe Figma Make's sandbox, not this repository, and would mislead coding agents working here.

## How the port maps to the app

The prototype switches screens with React state. The app turns each screen into a Next.js route, splits the components into `components/` and `features/`, replaces sample data with calls to `/api/*`, and drops the design-review "state switch" toggles (loading/empty/error now come from real data). See [`docs/03-App-Flow.md`](../../docs/03-App-Flow.md) for the route map and [`docs/04-UI-UX-Design-Brief.md`](../../docs/04-UI-UX-Design-Brief.md) for the design tokens taken from `source/src/index.css`.

## Re-importing a newer export

1. Put the new zip here.
2. Extract it: `unzip -o <zip>`, then `unzip -o <name>.make`; the code is in `make_repos/<id>.zip`.
3. Unpack the packfiles into a scratch bare repository (`git init --bare x.git`, copy `packs/*.pack` to `x.git/objects/pack/`, run `git index-pack` on each, then `git update-ref refs/heads/main <commit_sha from manifest.json>`), and `git archive main | tar -x -C new-source/`.
4. `diff -ru source/ new-source/` shows what the designer changed; apply those changes to the matching files in `components/` and `features/`.
