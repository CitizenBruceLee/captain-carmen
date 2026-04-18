# Captain Carmen

Arcade-style browser shooter built with React and Vite.

## Run Locally

Prerequisite: Node.js

1. Install dependencies:
   `npm install`
2. Start the dev server:
   `npm run dev`
3. Open http://localhost:3000/

## Deploy To Netlify

This project is configured for Netlify with [netlify.toml](./netlify.toml).

### Option A: Deploy From GitHub

1. Push the repo to GitHub.
2. In Netlify, choose Add new site > Import an existing project.
3. Connect GitHub and select this repository.
4. Netlify should pick up these settings automatically:
   Build command: `npm run build`
   Publish directory: `dist`
5. Click Deploy site.

### Option B: Manual Upload

1. Build the project locally:
   `npm install`
   `npm run build`
2. In Netlify, choose Add new site > Deploy manually.
3. Drag the `dist` folder into Netlify.
