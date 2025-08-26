# Dashboards

Serve the app over HTTP to use Firebase.

```bash
node server.js
```

The server hosts the static files on `http://localhost:8080` so Firebase requests include a valid origin header and avoid CORS errors.
