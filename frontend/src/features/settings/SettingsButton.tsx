import { RotateCcw, Settings } from 'lucide-react'

import { Button } from '../../components/ui/button'
import { appConfig } from '../../config/appConfig'
import { Dialog, DialogTrigger } from '../../components/ui/dialog'
import { useConfigStore } from '../../store/useConfigStore'
import { useLayoutStore } from '../../store/useLayoutStore'
import { SettingsPanel } from './SettingsPanel'

export function SettingsButton() {
  const compactLayouts = useLayoutStore((state) => state.compactLayouts)
  const hiddenWidgetIds = useConfigStore((state) => state.hiddenWidgetIds)
  const visibleWidgetIds = appConfig.widgets
    .map((widget) => widget.id)
    .filter((widgetId) => !hiddenWidgetIds.includes(widgetId))

  return (
    <div className="fixed right-6 top-6 z-20 flex gap-2">
      <Button
        aria-label="Tidy widget layout"
        size="icon"
        variant="ghost"
        onClick={() => compactLayouts(visibleWidgetIds)}
        title="Tidy layout"
      >
        <RotateCcw className="h-5 w-5" aria-hidden="true" />
      </Button>
      <Dialog>
        <DialogTrigger asChild>
          <Button aria-label="Settings" size="icon" variant="glass" title="Settings">
            <Settings className="h-5 w-5" aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <SettingsPanel />
      </Dialog>
    </div>
  )
}
