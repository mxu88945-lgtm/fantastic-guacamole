/**
 * Global state management via React Context + localStorage
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getProviders, saveProviders,
  getModels, saveModels,
  getActiveModel, saveActiveModel,
  getConversations, saveConversations,
  getActiveConversationId, saveActiveConversationId,
  getMemories, saveMemories,
  getTheme, saveTheme,
  generateId,
} from './utils/db.js';

const AppContext = createContext(null);

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export function AppProvider({ children }) {
  const [providers, setProviders] = useState(() => getProviders());
  const [models, setModels] = useState(() => getModels());
  const [activeModel, setActiveModel] = useState(() => getActiveModel());
  const [conversations, setConversations] = useState(() => getConversations());
  const [activeConversationId, setActiveConversationId] = useState(() => getActiveConversationId());
  const [memories, setMemories] = useState(() => getMemories());
  const [theme, setThemeState] = useState(() => getTheme());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('providers');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Apply theme on mount and whenever it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // ---- Providers ----
  const updateProviders = useCallback((updated) => {
    setProviders(updated);
    saveProviders(updated);
  }, []);

  const addProvider = useCallback((data) => {
    const newProvider = { id: generateId(), ...data, enabled: true };
    const updated = [...providers, newProvider];
    updateProviders(updated);
    return newProvider;
  }, [providers, updateProviders]);

  const editProvider = useCallback((id, data) => {
    const updated = providers.map(p => p.id === id ? { ...p, ...data } : p);
    updateProviders(updated);
  }, [providers, updateProviders]);

  const deleteProvider = useCallback((id) => {
    const updated = providers.filter(p => p.id !== id);
    updateProviders(updated);
    // also remove models for this provider
    const updatedModels = models.filter(m => m.providerId !== id);
    setModels(updatedModels);
    saveModels(updatedModels);
    // clear active model if it belonged to this provider
    if (activeModel?.providerId === id) {
      setActiveModel(null);
      saveActiveModel(null);
    }
  }, [providers, models, activeModel, updateProviders]);

  const toggleProvider = useCallback((id) => {
    editProvider(id, { enabled: !providers.find(p => p.id === id)?.enabled });
  }, [providers, editProvider]);

  // ---- Models ----
  const updateModels = useCallback((updated) => {
    setModels(updated);
    saveModels(updated);
  }, []);

  const addModel = useCallback((data) => {
    const newModel = { id: generateId(), ...data };
    const updated = [...models, newModel];
    updateModels(updated);
    return newModel;
  }, [models, updateModels]);

  const deleteModel = useCallback((id) => {
    const updated = models.filter(m => m.id !== id);
    updateModels(updated);
    if (activeModel?.modelId === id) {
      setActiveModel(null);
      saveActiveModel(null);
    }
  }, [models, activeModel, updateModels]);

  const selectModel = useCallback((modelId, providerId) => {
    const val = modelId ? { modelId, providerId } : null;
    setActiveModel(val);
    saveActiveModel(val);
  }, []);

  // ---- Conversations ----
  const updateConversations = useCallback((updated) => {
    setConversations(updated);
    saveConversations(updated);
  }, []);

  const selectConversation = useCallback((id) => {
    setActiveConversationId(id);
    saveActiveConversationId(id);
  }, []);

  const createConversation = useCallback(() => {
    const newConv = {
      id: generateId(),
      title: '新对话',
      createdAt: Date.now(),
      messages: [],
    };
    const updated = [newConv, ...conversations];
    updateConversations(updated);
    selectConversation(newConv.id);
    return newConv;
  }, [conversations, updateConversations, selectConversation]);

  const deleteConversation = useCallback((id) => {
    const updated = conversations.filter(c => c.id !== id);
    updateConversations(updated);
    if (activeConversationId === id) {
      const next = updated[0]?.id || null;
      selectConversation(next);
    }
  }, [conversations, activeConversationId, updateConversations, selectConversation]);

  const updateConversation = useCallback((id, data) => {
    const updated = conversations.map(c => c.id === id ? { ...c, ...data } : c);
    updateConversations(updated);
  }, [conversations, updateConversations]);

  const appendMessage = useCallback((conversationId, message) => {
    setConversations(prev => {
      const updated = prev.map(c => {
        if (c.id !== conversationId) return c;
        return { ...c, messages: [...c.messages, message] };
      });
      saveConversations(updated);
      return updated;
    });
  }, []);

  const updateLastAssistantMessage = useCallback((conversationId, content) => {
    setConversations(prev => {
      const updated = prev.map(c => {
        if (c.id !== conversationId) return c;
        const msgs = [...c.messages];
        // find last assistant message
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant') {
            msgs[i] = { ...msgs[i], content };
            break;
          }
        }
        return { ...c, messages: msgs };
      });
      saveConversations(updated);
      return updated;
    });
  }, []);

  // ---- Memories ----
  const updateMemories = useCallback((updated) => {
    setMemories(updated);
    saveMemories(updated);
  }, []);

  const addMemory = useCallback((data) => {
    const newMem = { id: generateId(), ...data, enabled: true };
    updateMemories([...memories, newMem]);
    return newMem;
  }, [memories, updateMemories]);

  const editMemory = useCallback((id, data) => {
    updateMemories(memories.map(m => m.id === id ? { ...m, ...data } : m));
  }, [memories, updateMemories]);

  const deleteMemory = useCallback((id) => {
    updateMemories(memories.filter(m => m.id !== id));
  }, [memories, updateMemories]);

  const toggleMemory = useCallback((id) => {
    editMemory(id, { enabled: !memories.find(m => m.id === id)?.enabled });
  }, [memories, editMemory]);

  // ---- Theme ----
  const setTheme = useCallback((t) => {
    setThemeState(t);
    saveTheme(t);
  }, []);

  const activeConversation = conversations.find(c => c.id === activeConversationId) || null;
  const activeProvider = activeModel
    ? providers.find(p => p.id === activeModel.providerId) || null
    : null;

  return (
    <AppContext.Provider value={{
      // providers
      providers, addProvider, editProvider, deleteProvider, toggleProvider,
      // models
      models, addModel, deleteModel, selectModel,
      // active model/provider
      activeModel, activeProvider,
      // conversations
      conversations, activeConversationId, activeConversation,
      selectConversation, createConversation, deleteConversation,
      updateConversation, appendMessage, updateLastAssistantMessage,
      // memories
      memories, addMemory, editMemory, deleteMemory, toggleMemory,
      // theme
      theme, setTheme,
      // UI state
      settingsOpen, setSettingsOpen,
      settingsTab, setSettingsTab,
      sidebarOpen, setSidebarOpen,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
