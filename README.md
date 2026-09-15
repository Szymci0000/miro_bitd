## Miro App

Web SDK-only Miro app (React + TypeScript + Vite), configured for local development on `http://localhost:3000`.

**Note**:

- Use a Chromium-based browser for local HTTP development. Safari enforces HTTPS and blocks localhost over HTTP.
- Docs: [Miro developers](https://developers.miro.com).

### How to start locally

1. Run `npm i` to install dependencies.
2. Run `npm start` — the app serves at `http://localhost:3000`.
3. Create an app in the [Miro Developer Dashboard](https://miro.com/app/settings/user-profile/apps), then paste the contents of [`app-manifest.yaml`](./app-manifest.yaml) via **Edit in Manifest** (or set App URL to `http://localhost:3000`).
4. Install the app on your Developer team, open a board on that team, and launch the app from the toolbar.

### How to build the app

- Run `npm run build`. \
  This generates a static output inside [`dist/`](./dist), which you can host on a static hosting
  service.

### Folder structure

<!-- The following tree structure is just an example -->

```
.
├── src
│  ├── assets
│  │  └── style.css
│  ├── app.tsx      // The code for the app lives here
│  └── index.ts    // The code for the app entry point lives here
├── app.html       // The app itself. It's loaded on the board inside the 'appContainer'
└── index.html     // The app entry point. This is what you specify in the 'App URL' box in the Miro app settings
```

### About the app

This sample app provides you with boilerplate setup and configuration that you can further customize to build your own app.

<!-- describe shortly the purpose of the sample app -->

Built using [`create-miro-app`](https://www.npmjs.com/package/create-miro-app).

This app uses [Vite](https://vitejs.dev/). \
If you want to modify the `vite.config.js` configuration, see the [Vite documentation](https://vitejs.dev/guide/).
