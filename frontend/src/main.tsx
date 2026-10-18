import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { StoreProvider } from './lib/store'
import { AccessibilityProvider } from './lib/accessibility'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AccessibilityProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </AccessibilityProvider>
  </React.StrictMode>,
)
