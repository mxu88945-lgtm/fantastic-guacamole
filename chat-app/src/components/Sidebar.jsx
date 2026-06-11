import { useApp } from '../store.js';

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays}天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export default function Sidebar() {
  const {
    conversations,
    activeConversationId,
    selectConversation,
    createConversation,
    deleteConversation,
    sidebarOpen,
    setSidebarOpen,
  } = useApp();

  function handleNewChat() {
    createConversation();
    setSidebarOpen(false);
  }

  function handleSelect(id) {
    selectConversation(id);
    setSidebarOpen(false);
  }

  function handleDelete(e, id) {
    e.stopPropagation();
    if (window.confirm('确认删除此对话？')) {
      deleteConversation(id);
    }
  }

  return (
    <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <span className="sidebar-title">💬 AI 聊天</span>
        <button
          className="new-chat-btn"
          onClick={handleNewChat}
          title="新对话"
          aria-label="新对话"
        >
          +
        </button>
      </div>

      <div className="conversation-list">
        {conversations.length === 0 ? (
          <div className="sidebar-empty">暂无对话<br />点击 + 开始聊天</div>
        ) : (
          conversations.map(conv => (
            <div
              key={conv.id}
              className={`conversation-item ${conv.id === activeConversationId ? 'active' : ''}`}
              onClick={() => handleSelect(conv.id)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="conversation-title">{conv.title}</div>
                <div className="conversation-meta">{formatDate(conv.createdAt)}</div>
              </div>
              <button
                className="conversation-delete-btn"
                onClick={(e) => handleDelete(e, conv.id)}
                title="删除对话"
                aria-label="删除对话"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
