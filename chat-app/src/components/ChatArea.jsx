import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../store.jsx';
import MessageBubble from './MessageBubble.jsx';
import { ThemeToggleButton } from './ThemeToggle.jsx';
import { streamChat } from '../utils/api.js';
import { generateId } from '../utils/db.js';

export default function ChatArea({ onOpenSidebar }) {
  const {
    providers, models, activeModel, activeProvider,
    activeConversation, activeConversationId,
    appendMessage, updateLastAssistantMessage, updateConversation,
    createConversation,
    selectModel,
    setSettingsOpen, setSettingsTab,
    memories,
  } = useApp();

  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

  // Auto-resize textarea
  function handleInputChange(e) {
    setInputValue(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) handleSend();
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setIsStreaming(false);
  }

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;

    // Ensure we have an active conversation
    let convId = activeConversationId;
    if (!convId) {
      const newConv = createConversation();
      convId = newConv.id;
    }

    if (!activeModel || !activeProvider) {
      setSettingsTab('providers');
      setSettingsOpen(true);
      return;
    }

    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Add user message
    const userMsg = { id: generateId(), role: 'user', content: text, createdAt: Date.now() };
    appendMessage(convId, userMsg);

    // Build messages array from conversation history + inject memories
    const convMessages = [
      ...(activeConversation?.messages || []),
      userMsg,
    ]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));

    const enabledMemories = memories.filter(m => m.enabled);
    let apiMessages = convMessages;
    if (enabledMemories.length > 0) {
      apiMessages = [
        { role: 'system', content: enabledMemories.map(m => m.content).join('\n\n') },
        ...convMessages,
      ];
    }

    // Add placeholder assistant message
    const assistantMsg = { id: generateId(), role: 'assistant', content: '', createdAt: Date.now() };
    appendMessage(convId, assistantMsg);

    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    let fullContent = '';

    await streamChat({
      provider: activeProvider,
      model: activeModel.modelId,
      messages: apiMessages,
      signal: controller.signal,
      onChunk(chunk) {
        fullContent += chunk;
        updateLastAssistantMessage(convId, fullContent);
      },
      onDone() {
        setIsStreaming(false);
        // Update conversation title from first user message if still default
        // Do this by checking conversation title
      },
      onError(err) {
        const errMsg = { id: generateId(), role: 'error', content: err, createdAt: Date.now() };
        // Replace placeholder with error
        updateLastAssistantMessage(convId, '');
        appendMessage(convId, { ...errMsg });
        setIsStreaming(false);
      },
    });

    // Auto-title: if conversation title is still default, use first few words of user message
    if (activeConversation?.title === '新对话' || !activeConversation) {
      const title = text.slice(0, 30) + (text.length > 30 ? '...' : '');
      updateConversation(convId, { title });
    }
  }, [
    inputValue, isStreaming, activeConversationId, activeConversation,
    activeModel, activeProvider, memories,
    appendMessage, updateLastAssistantMessage, updateConversation,
    createConversation, setSettingsOpen, setSettingsTab,
  ]);

  function openProviderSettings() {
    setSettingsTab('providers');
    setSettingsOpen(true);
  }

  const messages = activeConversation?.messages || [];
  const conversationTitle = activeConversation?.title || 'AI 聊天';

  return (
    <>
      {/* Header */}
      <div className="header">
        {/* Mobile menu button */}
        <button
          className="icon-btn"
          style={{ display: 'none' }}
          id="sidebar-toggle"
          onClick={onOpenSidebar}
          aria-label="打开侧栏"
        >
          ☰
        </button>

        <div className="header-title">{conversationTitle}</div>

        {/* Model selector */}
        <div className="model-selector">
          <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>模型</span>
          <select
            value={activeModel ? `${activeModel.modelId}::${activeModel.providerId}` : ''}
            onChange={e => {
              const val = e.target.value;
              if (!val) { selectModel(null, null); return; }
              const [modelId, providerId] = val.split('::');
              selectModel(modelId, providerId);
            }}
          >
            <option value="">选择模型</option>
            {providers
              .filter(p => p.enabled)
              .map(p => {
                const pModels = models.filter(m => m.providerId === p.id);
                if (!pModels.length) return null;
                return (
                  <optgroup key={p.id} label={p.name}>
                    {pModels.map(m => (
                      <option key={m.id} value={`${m.name}::${p.id}`}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
          </select>
        </div>

        <div className="header-actions">
          <ThemeToggleButton />
          <button
            className="icon-btn"
            onClick={() => setSettingsOpen(true)}
            title="设置"
            aria-label="设置"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Chat body */}
      <div className="chat-area">
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <div className="chat-welcome-icon">🤖</div>
              <h2>开始对话</h2>
              <p>
                {!activeModel
                  ? '请先在设置中添加供应商和模型'
                  : `使用 ${activeModel.modelId} 开始聊天`}
              </p>
              {!activeModel && (
                <button
                  className="btn-primary"
                  style={{ marginTop: 16 }}
                  onClick={openProviderSettings}
                >
                  前往设置
                </button>
              )}
            </div>
          ) : (
            messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id || idx}
                message={msg}
                isStreaming={isStreaming && idx === messages.length - 1 && msg.role === 'assistant'}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="input-area">
          <div className="input-wrapper">
            <textarea
              ref={textareaRef}
              className="message-input"
              placeholder={activeModel ? '输入消息，Enter 发送，Shift+Enter 换行' : '请先配置模型...'}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button className="stop-btn" onClick={handleStop} title="停止生成" aria-label="停止生成">
                ■
              </button>
            ) : (
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={!inputValue.trim() || !activeModel}
                title="发送"
                aria-label="发送"
              >
                ↑
              </button>
            )}
          </div>
          <div className="input-hint">Enter 发送 · Shift+Enter 换行</div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          #sidebar-toggle { display: flex !important; }
        }
      `}</style>
    </>
  );
}
