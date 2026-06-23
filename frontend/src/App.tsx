import { AppShell } from './app/AppShell'
import { Providers } from './app/providers'

function App() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  )
}

export default App
