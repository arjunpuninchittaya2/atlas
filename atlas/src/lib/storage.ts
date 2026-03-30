const API_KEY_KEY = 'atlas_api_key'

export function getApiKey() {
  return localStorage.getItem(API_KEY_KEY)
}

export function setApiKey(apiKey: string) {
  localStorage.setItem(API_KEY_KEY, apiKey)
}

export function clearApiKey() {
  localStorage.removeItem(API_KEY_KEY)
}

export function isAuthenticated(): boolean {
  return getApiKey() !== null
}

