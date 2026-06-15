import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Mock localStorage since jsdom may not provide it properly in this version
const localStorageStore = {}
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key) => localStorageStore[key] ?? null,
    setItem: (key, value) => { localStorageStore[key] = String(value) },
    removeItem: (key) => { delete localStorageStore[key] },
    clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]) },
    get length() { return Object.keys(localStorageStore).length },
    key: (index) => Object.keys(localStorageStore)[index] ?? null,
  },
  writable: true,
  configurable: true,
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

// Silence console errors/warnings in tests
vi.spyOn(console, 'error').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})
