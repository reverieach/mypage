import { RotateCcw, Settings } from 'lucide-react'

import { Button } from '../../components/ui/button'
import { useLayoutStore } from '../../store/useLayoutStore'

export function SettingsButton() {
  const resetLayouts = useLayoutStore((state) => state.resetLayouts)

  return (
    <div className="fixed right-6 top-6 z-20 flex gap-2">
      <Button
        aria-label="Reset widget layout"
        size="icon"
        variant="ghost"
        onClick={resetLayouts}
        title="Reset layout"
      >
        <RotateCcw className="h-5 w-5" aria-hidden="true" />
      </Button>
      <Button aria-label="Settings" size="icon" variant="glass" title="Settings">
        <Settings className="h-5 w-5" aria-hidden="true" />
      </Button>
    </div>
  )
}
