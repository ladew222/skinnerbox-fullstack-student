# Frontend Notes

The source of truth for project architecture, run instructions, Raspberry Pi setup, and validation commands is the root README:

- [README.md](/Users/egweinberg/Documents/skinnerbox-fullstack-student/README.md)

Frontend-specific commands:

```bash
npm install
npm start
CI=true npm test -- --watch=false
npm run build
```

When you use `npm start`, CRA's dev server proxies `/api` to `http://localhost:5000`
by default because of the `proxy` setting in [package.json](/Users/egweinberg/Documents/skinnerbox-fullstack-student/frontend/package.json).
If your backend is on another machine during local development, set:

```bash
REACT_APP_BACKEND_URL=http://<backend-host>:5000 npm start
```
