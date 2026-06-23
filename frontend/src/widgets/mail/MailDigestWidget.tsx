import { Mail } from 'lucide-react'

export function MailDigestWidget() {
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="flex items-center gap-2 text-sm font-medium text-white/82">
        <Mail className="h-4 w-4" aria-hidden="true" />
        Mail digest
      </div>
      <div className="space-y-2 overflow-y-auto pr-1">
        {['Inbox summary source not configured', 'Important mail will appear here'].map(
          (item) => (
            <div key={item} className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-white/70">
              {item}
            </div>
          ),
        )}
      </div>
    </div>
  )
}
