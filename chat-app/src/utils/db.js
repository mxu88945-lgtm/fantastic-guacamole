/**
 * localStorage CRUD helpers
 */

export function getItem(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    if (item === null) return defaultValue;
    return JSON.parse(item);
  } catch {
    return defaultValue;
  }
}

export function setItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('localStorage setItem failed:', e);
    return false;
  }
}

export function removeItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.error('localStorage removeItem failed:', e);
  }
}

export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---- Providers ----
export function getProviders() {
  return getItem('providers', []);
}

export function saveProviders(providers) {
  setItem('providers', providers);
}

// ---- Models ----
export function getModels() {
  return getItem('models', []);
}

export function saveModels(models) {
  setItem('models', models);
}

// ---- Active model ----
export function getActiveModel() {
  return getItem('activeModel', null);
}

export function saveActiveModel(model) {
  setItem('activeModel', model);
}

// ---- Conversations ----
export function getConversations() {
  return getItem('conversations', []);
}

export function saveConversations(conversations) {
  setItem('conversations', conversations);
}

export function getActiveConversationId() {
  return getItem('activeConversationId', null);
}

export function saveActiveConversationId(id) {
  setItem('activeConversationId', id);
}

// ---- Memories ----
export function getMemories() {
  return getItem('memories', []);
}

export function saveMemories(memories) {
  setItem('memories', memories);
}

// ---- Theme ----
export function getTheme() {
  return getItem('theme', 'system');
}

export function saveTheme(theme) {
  setItem('theme', theme);
}
