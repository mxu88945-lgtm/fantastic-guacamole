import { useState } from 'react';
import { useApp } from '../store.jsx';

export default function MemoryLibrary() {
  const { memories, addMemory, editMemory, deleteMemory, toggleMemory } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  function openAdd() {
    setEditingId(null);
    setTitle('');
    setContent('');
    setError('');
    setShowForm(true);
  }

  function openEdit(mem) {
    setEditingId(mem.id);
    setTitle(mem.title);
    setContent(mem.content);
    setError('');
    setShowForm(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setError('请输入标题'); return; }
    if (!content.trim()) { setError('请输入内容'); return; }

    if (editingId) {
      editMemory(editingId, { title: title.trim(), content: content.trim() });
    } else {
      addMemory({ title: title.trim(), content: content.trim() });
    }
    setShowForm(false);
    setEditingId(null);
  }

  function handleDelete(id) {
    if (window.confirm('确认删除此记忆？')) {
      deleteMemory(id);
    }
  }

  return (
    <div>
      <div className="section-header">
        <span className="section-title">记忆库</span>
        <button className="btn-primary" onClick={openAdd}>
          + 添加
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
        启用的记忆片段将作为系统提示前置注入，影响模型的回答风格和背景知识。
      </p>

      {memories.length === 0 && !showForm ? (
        <div className="empty-state">暂无记忆<br />添加后可自动注入系统提示</div>
      ) : (
        <div className="memory-list">
          {memories.map(mem => (
            <div key={mem.id} className="memory-card">
              <div className="memory-card-header">
                <label className="toggle-switch" title={mem.enabled ? '点击禁用' : '点击启用'}>
                  <input
                    type="checkbox"
                    checked={mem.enabled}
                    onChange={() => toggleMemory(mem.id)}
                  />
                  <span className="toggle-slider" />
                </label>
                <span className="memory-title">{mem.title}</span>
                <span className={`badge ${mem.enabled ? 'badge-active' : 'badge-disabled'}`}>
                  {mem.enabled ? '启用' : '禁用'}
                </span>
              </div>
              <div className="memory-content-preview">{mem.content}</div>
              <div className="memory-actions">
                <button
                  className="btn-secondary"
                  style={{ padding: '4px 12px', fontSize: 12 }}
                  onClick={() => openEdit(mem)}
                >
                  编辑
                </button>
                <button
                  className="btn-danger"
                  style={{ padding: '4px 12px', fontSize: 12 }}
                  onClick={() => handleDelete(mem.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="memory-form">
          <h3>{editingId ? '编辑记忆' : '添加记忆'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">标题 *</label>
              <input
                className="form-input"
                placeholder="例如：我的角色设定..."
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">内容 *</label>
              <textarea
                className="form-textarea"
                placeholder="输入将被注入系统提示的内容..."
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={5}
              />
            </div>
            {error && (
              <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 10 }}>{error}</div>
            )}
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                取消
              </button>
              <button type="submit" className="btn-primary">
                {editingId ? '保存' : '添加'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
