# MyPage Frontend

Vite + React + TypeScript frontend for the MyPage browser start page.

## Run

```powershell
npm install
npm run dev
```

Default URL:

```txt
http://127.0.0.1:5173/
```

## Verify

```powershell
npm run lint
npm run build
```

## Important Files

- `src/app/AppShell.tsx`: main visual shell.
- `src/config/appConfig.ts`: search engines and widget defaults.
- `src/config/types.ts`: config and widget types.
- `src/store/useConfigStore.ts`: user config in `localStorage`.
- `src/store/useLayoutStore.ts`: widget layouts in `localStorage`.
- `src/features/config/ConfigBackupSync.tsx`: syncs local browser cache with Agent backup.
- `src/layout/defaultLayouts.ts`: default and restored-widget layout logic.
- `src/layout/WidgetGrid.tsx`: draggable/resizable widget grid.
- `src/widgets/registry.tsx`: widget registry.
- `src/data/apiClient.ts`: local Agent fetch helpers.
- `src/data/configBackup.ts`: config backup API types and helpers.
- `src/data/widgetData.ts`: widget data types and query hook.

## Adding A Widget

1. Add or reuse a widget type in `src/config/types.ts`.
2. Create the widget component under `src/widgets/<name>/`.
3. Register it in `src/widgets/registry.tsx`.
4. Add its default config and layout in `src/config/appConfig.ts`.
5. If dynamic, add an Agent endpoint and data type in `src/data/widgetData.ts`.

Default layout matters: it is reused when a hidden widget is restored from Settings.

## Config Backup

The frontend persists to `localStorage` for fast startup and offline use. `ConfigBackupSync` also mirrors links, wallpapers, hidden widgets, layouts, sticky note text, and search engine choice to the local Agent. Settings has a Backup tab for status, export/import, and restoring the latest Agent snapshot.

## Styling Notes

- Use the existing local UI primitives before adding new component libraries.
- Use lucide icons for buttons when possible.
- Hide internal widget scrollbars with `scrollbar-none`.
- Keep widget content compact and resilient to small sizes.
- Avoid exposing raw engineering config in Settings.

## Extension Build

```powershell
npm run build
```

Load `dist/` as an unpacked Chrome or Edge extension.
