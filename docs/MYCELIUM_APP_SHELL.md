# Mycelium App Shell

The first DAOVibe Mycelium app shell lives in `apps/mycelium-web`.

## Run Locally

Start the local Mycelium node API:

```bat
npm.cmd run dev
```

Start the app shell:

```bat
npm.cmd run app:dev
```

Open the Vite local URL printed in the terminal. In local dev, Vite proxies app API calls to the default Mycelium server at `http://localhost:3000`. Override the API base URL with:

```bat
set VITE_MYCELIUM_API_BASE_URL=http://localhost:3001
npm.cmd run app:dev
```

## Current Support

- local node status
- local node identity
- sync status
- phrase search
- phrase detail
- best meaning for the selected phrase
- phrase observation
- meaning proposal
- visible tombstone execution disabled state

The app uses `src/client/MyceliumClient.ts` for HTTP access.

## Intentionally Not Included Yet

- auth or remote accounts
- correction voting UI
- tombstone write UI
- tombstone execution
- marketplace, token, or economy UI
- SBP, EEE, Student Nodes, or symbolic orchestrators
- mobile app packaging
