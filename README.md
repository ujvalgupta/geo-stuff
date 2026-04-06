# AI Crawlability Checker

Minimal API + local web UI that evaluates whether an LLM crawler can likely:

- fetch a page
- access the content
- render it
- parse meaningful text

## Run

```powershell
npm start
```

Then open:

```text
http://localhost:3000
```

## API

```powershell
curl -X POST http://localhost:3000/analyze ^
  -H "Content-Type: application/json" ^
  -d "{\"url\":\"https://example.com\"}"
```

## CLI

The old CLI is still available:

```powershell
npm run start:cli -- https://example.com --json
```

## Checks

- Fetchability
- robots.txt
- Bot access simulation
- JavaScript rendering
- HTML parsability
- Content extraction

Each check returns:

```json
{
  "status": "PASS | FAIL | WARNING",
  "reason": "string",
  "metadata": {}
}
```

## Notes

- The app serves a basic built-in UI from `public/`.
- The project runs with `node --experimental-strip-types`.
