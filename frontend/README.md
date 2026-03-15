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

If you are running the frontend against a backend on another machine, set:

```bash
REACT_APP_BACKEND_URL=http://<backend-host>:5000 npm start
```
