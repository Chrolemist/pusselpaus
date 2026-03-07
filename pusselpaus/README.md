# PusselPaus

## Bump Version Number

If you are standing in `c:\pusselpaus\pusselpaus`, use one of these:

```powershell
npm version patch --no-git-tag-version
npm version minor --no-git-tag-version
npm version major --no-git-tag-version
```

If you want to set an exact version manually:

```powershell
npm version 0.3.7 --no-git-tag-version
```

Then rebuild so the new version is baked into the frontend:

```powershell
npm run build
```

The lobby version label reads from `pusselpaus/package.json` during build via Vite, so the updated number will only appear after a new build/deploy.

## Add New Games Safely

When you add more games, follow [docs/adding-games.md](docs/adding-games.md).
For multiplayer structure and future live games, follow [docs/multiplayer-architecture.md](docs/multiplayer-architecture.md).

The important rule is that every new game should stay route-lazy and keep heavy UI, audio, and tutorial code inside the game module instead of the app shell.

## Supabase Migrations

This workspace has the frontend app in `pusselpaus/` and the Supabase folder one level above it.

If you are standing in `c:\pusselpaus\pusselpaus`, use these commands:

```powershell
Push-Location ..
npx supabase migration list
npx supabase db push
Pop-Location
```

What this does:

- `migration list` shows which migrations exist locally and remotely.
- `db push` applies the local migrations that are still missing in the linked remote project.

Example from the Ping Pong multiplayer fix:

- Added `supabase/migrations/20260307155000_allow_pingpong_match_creation.sql`
- Ran `npx supabase migration list`
- Confirmed `20260307155000` existed only locally
- Ran `npx supabase db push`
- Ran `npx supabase migration list` again and confirmed it existed both locally and remotely

If `supabase` is not installed globally, use `npx supabase ...` as above. In this repo that worked with the local CLI dependency from the root `package.json`.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
