Deployment to Vercel

This repository is configured to deploy to Vercel. There are two recommended ways to enable automatic deploys:

1) Connect the GitHub repository in the Vercel dashboard (recommended)
   - Go to https://vercel.com and import this GitHub repository.
   - Vercel will detect a Vite/React project and use `npm run build` with the provided `vercel.json` (outputDirectory: `dist`).
   - No additional secrets are required when using the Vercel GitHub integration.

2) Use the provided GitHub Actions workflow (.github/workflows/deploy-vercel.yml)
   - This workflow builds and deploys on pushes to `main`/`master`.
   - Before it can run, add these repository secrets in GitHub (Settings → Secrets → Actions):
     - VERCEL_TOKEN — a Vercel Personal Token (see https://vercel.com/account/tokens)
     - VERCEL_ORG_ID — your Vercel organization ID
     - VERCEL_PROJECT_ID — the Vercel project ID for this site
   - After adding the secrets, pushes to main/master will trigger a production deploy.

Notes
- The project uses Vite and outputs to `dist`; vercel.json is configured accordingly.
- If you prefer previews for pull requests, the workflow also runs on pull_request.

If you want this repo connected to a specific Vercel project or need help retrieving the Vercel IDs/tokens, say so and provide access or guidance about where to look, and assistance will continue.