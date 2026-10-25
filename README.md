# Pace Club Baku

A running community app for logging runs, tracking progress, and joining local challenges.

## Live site

[Open Pace Club Baku](https://fsrkh12-arch.github.io/run-club-upgrade/)

The public site is hosted on GitHub Pages. Sign in with Google to access the app.

## Run locally

Install dependencies, then start the development server:

```sh
pnpm install
pnpm dev
```

The app uses Supabase for authentication and data. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in a local `.env` file before starting it.
