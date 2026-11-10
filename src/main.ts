import './styles.css'
import { mountApp } from './ui/app'

const app = document.querySelector<HTMLDivElement>('#app')

// Reading window.localStorage throws when the browser blocks storage.
function getStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

if (app) {
  mountApp(app, getStorage())
}
