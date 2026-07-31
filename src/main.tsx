import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorToasts from './components/ErrorToasts'
import { AuthProvider } from './context/AuthContext'
import { BrandingProvider } from './context/BrandingContext'
import { installerFiletErreurs } from './lib/erreurs'
import './index.css'

installerFiletErreurs()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <BrandingProvider>
          <App />
          <ErrorToasts />
        </BrandingProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
