# Pace Club Baku

Pace Club Baku grew from a problem I noticed: running can feel discouraging when people lack a community to run with or a clear way to see their progress. I wanted to explore both needs in one application, connecting runners around shared challenges while helping them track their training.

This project also pushed me into unfamiliar territory. I researched and learned about maps and APIs, motion detection, gyroscope sensitivity, and progressive web app concepts as I developed the idea. The repository combines a public landing site with an account-based app; the features listed below describe what the project currently includes rather than every idea I explored.

[Open the public site](https://fsrkh12-arch.github.io/run-club-upgrade/)

## What is in the project

- A responsive landing site and an application interface for runs, goals, community activity, and challenges.
- Run-entry and progress views, with Supabase used for authentication and data in the application.
- Email/password and social sign-in interfaces. Actual sign-in availability depends on the connected Supabase project and provider configuration.
- Some interfaces contain sample content. Landing-page statistics and product claims should be independently verified before being interpreted as actual usage or available services.

## Run locally

The frontend uses React, TypeScript, Vite, and Tailwind CSS. Install Node.js, then from the repository directory:

```sh
npm install
npm run dev
```

Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the Supabase project you intend to use. The project's migrations are in `supabase/migrations`; a working backend also requires appropriate database and authentication configuration. Do not put service-role keys or other secrets in frontend environment variables.

Other commands include `npm run build`, `npm run lint`, and `npm test`. The currently included example test is a placeholder, not comprehensive feature coverage.
