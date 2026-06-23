# Widget Contract

Widgets are configured in `frontend/src/config/appConfig.ts` and rendered through `frontend/src/widgets/registry.tsx`.

## Widget Config

Every widget has:

```ts
{
  id: string
  type: string
  title: string
  layout: {
    x: number
    y: number
    w: number
    h: number
    minW?: number
    minH?: number
  }
}
```

Dynamic widgets may also include:

```ts
{
  endpoint: string
  refreshIntervalMs: number
}
```

## Agent Envelope

Agent endpoints should return:

```json
{
  "updatedAt": "2026-06-23T08:00:00+08:00",
  "stale": false,
  "error": null,
  "data": {}
}
```

Rules:

- Frontend widgets render `loading`, `success`, `empty`, `error`, and `stale` states.
- The Agent returns display-ready normalized data, not raw scraped pages.
- Secrets stay in the Agent environment or local collector scripts.
- Scheduled collectors write cache files; widgets read through the Agent.

## Cache Files

The Agent looks for these optional cache files in `agent/app/data/`:

```txt
school_today.json
github_contributions.json
codex_usage_today.json
automation_digest.json
scripts_status.json
```

When a cache file is missing, the Agent returns built-in sample data. This keeps the frontend usable while real collectors are being developed.

## Adding A Widget

1. Create a component under `frontend/src/widgets/<name>/`.
2. Add a widget config type in `frontend/src/config/types.ts` if needed.
3. Register the widget in `frontend/src/widgets/registry.tsx`.
4. Add the widget entry in `frontend/src/config/appConfig.ts`.
5. Add or document the Agent endpoint if it needs dynamic data.
