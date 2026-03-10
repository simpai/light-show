import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode removed: it double-renders every component in dev mode,
// halving performance for a real-time 60fps rendering application.
createRoot(document.getElementById('root')).render(
  <App />,
)
