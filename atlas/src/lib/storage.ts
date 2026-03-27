const API_KEY_KEY = 'notionSyncApiKey'
const WORKSPACE_NAME_KEY = 'notionSyncWorkspaceName'

export function getApiKey() {
  return localStorage.getItem(API_KEY_KEY)
}

export function setApiKey(apiKey: string) {
  localStorage.setItem(API_KEY_KEY, apiKey)
}

export function clearApiKey() {
  localStorage.removeItem(API_KEY_KEY)
}

export function getWorkspaceName() {
  return localStorage.getItem(WORKSPACE_NAME_KEY)
}

export function setWorkspaceName(name: string) {
  localStorage.setItem(WORKSPACE_NAME_KEY, name)
}
