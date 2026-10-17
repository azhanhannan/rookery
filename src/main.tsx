import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App.tsx'
import { startGameSync } from './account/gameSync'
import { resumeReReview } from './app/reReview'
import { applyBoardTheme, loadBoardTheme } from './settings/boardTheme'
import { loadPieceSet, preloadPieceSet } from './settings/pieceSet'
import { startStateSync } from './sync/stateSync'

applyBoardTheme(loadBoardTheme())
preloadPieceSet(loadPieceSet())
startGameSync()
startStateSync()
// A re-review of shallow reviews that a reload interrupted carries on (low priority; app/reReview.ts).
resumeReReview()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
