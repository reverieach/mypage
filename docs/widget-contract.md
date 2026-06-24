# Widget Contract

Widgets are configured in `frontend/src/config/appConfig.ts`, typed in `frontend/src/config/types.ts`, and rendered through `frontend/src/widgets/registry.tsx`.

## Config Shape

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
    maxW?: number
    minH?: number
    maxH?: number
  }
}
```

Dynamic widgets also have:

```ts
{
  endpoint?: string
  refreshIntervalMs?: number
}
```

The `layout` field is more than a default starting position. It is also the source of truth for the restored size when a hidden widget is shown again from Settings.

## Widget Types

Current widget types:

- `links.grid`
- `github.heatmap`
- `school.today`
- `codex.usage`
- `automation.digest`
- `scripts.status`
- `notifications.center`
- `homework.due`
- `school.notices`
- `notes.sticky`
- `weather.summary`
- `mail.digest`
- `important.info`

When adding a new type, update:

1. `frontend/src/config/types.ts`
2. `frontend/src/widgets/registry.tsx`
3. `frontend/src/config/appConfig.ts`
4. the relevant widget component under `frontend/src/widgets/`
5. Agent endpoint docs if the widget is dynamic

## Rendering Contract

Widgets are wrapped by `WidgetShell`, which provides:

- title
- drag handle
- open/details button
- hide button
- consistent glass surface

Widget components should focus on content only. Do not duplicate shell controls inside normal widgets unless the action is widget-specific, such as refresh or dismiss.

## Dynamic Data Contract

Dynamic widgets use:

- `fetchAgentEnvelope` for GET
- `postAgentEnvelope` for local POST actions
- `useAgentWidget<T>` for polling and cached query state

Agent responses should be:

```json
{
  "updatedAt": "2026-06-24T02:00:00+08:00",
  "stale": false,
  "error": null,
  "data": {}
}
```

Widget components should handle:

- loading
- unavailable Agent
- stale data
- empty data
- normal success

Use `WidgetLoading`, `WidgetError`, and `WidgetMeta` where appropriate.

## Layout Rules

Default layouts live in `appConfig.ts`.

Persisted layouts live in `localStorage` under `mypage-widget-layouts`.

`normalizeLayouts` ensures persisted layouts cannot violate each widget's default minimum size.

When a hidden widget is restored:

- Settings calls `appendWidgetLayout`.
- The widget is placed after the currently visible widgets.
- It uses its default `w` and `h`, not a tiny minimum block.
- Breakpoint-specific layouts are clamped to each breakpoint's column count.

Do not bypass this flow by only removing an id from `hiddenWidgetIds`.

## Links Widget

Links are user-configurable and stored in `mypage-user-config-v2`.

The compact homepage grid:

- measures its container with `ResizeObserver`
- computes columns from the current width
- computes visible row height from the current height
- scrolls by row using snap behavior

The folder/detail view groups links by `category` and allows adding links per group.

## School Notices Widget

`school.notices` reads `GET /api/school/notices`.

Expected data:

```ts
{
  windowLabel: string
  sourceUrl: string
  hiddenCount: number
  candidateCount: number
  items: Array<{
    id: string
    title: string
    summary: string
    webLink: string
    publishedAt?: string | null
    deadline?: string | null
    importance: 'critical' | 'important' | 'normal' | 'low'
    category: string
  }>
}
```

Actions:

- refresh: `POST /api/school/notices/refresh`
- dismiss one item: `POST /api/school/notices/{notice_id}/dismiss`

The widget should show a compact count, hidden count, refresh button, external-link affordance, and per-item dismiss button.

## Settings Rules

Settings should remain user-facing:

- wallpaper management
- link management
- widget show/hide

Avoid exposing raw JSON config or implementation details in Settings. Engineering-oriented configuration belongs in docs or local files.

## Visual Rules

- Hide scrollbars with `scrollbar-none` unless visible scrollbars are explicitly desired.
- Keep controls compact and familiar: icons for refresh, close, open, hide, drag.
- Text must truncate or wrap safely inside widgets.
- Widget detail dialogs should animate in and out.
- Do not introduce a new design system unless the existing local primitives are insufficient.
