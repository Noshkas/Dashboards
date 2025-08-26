# Dashboards

Serve the app over HTTP to use Firebase and persist posts in the cloud. Posts
are also cached in `localStorage` so drafts are not lost if a Firestore write
fails.

```bash
node server.js
```

The server hosts the static files on `http://localhost:8080` so Firebase requests include a valid origin header and avoid CORS errors. All blog posts are stored in Firestore, allowing them to sync across devices once you're signed in.
