import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import App from './App'
import { AppStoreProvider } from './store/AppStore'
import { ConfirmProvider } from './components/ui/confirm'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <AppStoreProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </AppStoreProvider>
    </MotionConfig>
  </StrictMode>,
)
