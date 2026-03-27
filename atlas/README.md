# ATLAS

ATLAS syncs Google Classroom assignments into a Notion database.

## Development

Set Worker env vars and KV binding in `wrangler.jsonc`:

- `NOTION_CLIENT_ID`
- `NOTION_CLIENT_SECRET` (set via `wrangler secret put NOTION_CLIENT_SECRET`)
- `NOTION_REDIRECT_URI`
- `ATLAS_KV` namespace binding

Install and run:

```bash
npm ci
npm run dev
```

The frontend proxies `/api`, `/update`, and `/health` to the local Worker in development.

## Build

```bash
npm run lint
npm run build
```
