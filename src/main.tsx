import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initPurchases } from './monetization/purchases'

// Deliberately not awaited. Configuring RevenueCat reaches the network, and the game must
// start regardless — a store outage, airplane mode or a missing API key all resolve to
// "no entitlements", which can only ever cost the player a cosmetic. Components subscribe
// to the purchase state, so entitlements light up whenever they arrive.
void initPurchases()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
