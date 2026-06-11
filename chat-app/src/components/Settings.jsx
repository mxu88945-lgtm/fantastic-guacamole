import { useState } from 'react';
import { useApp } from '../store.jsx';
import ProviderForm from './ProviderForm.jsx';
import MemoryLibrary from './MemoryLibrary.jsx';
import { ThemeOptions } from './ThemeToggle.jsx';

const TABS = [
  { id: 'providers', label: '供应商' },
  { id: 'memory', label: '记忆库' },
  { id: 'mcp', label: 'MCP 工具' },
  { id: 'theme', label: '主题' },
];

function ProvidersTab() {
  const { providers, deleteProvider, toggleProvider, models } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);

  function handleEdit(p) {
    setEditingProvider(p);
    setShowForm(true);
  }

  function handleAdd() {
    setEditingProvider(null);
    setShowForm(true);
  }

  function handleClose() {
    setShowForm(false);
    setEditingProvider(null);
  }

  function handleDelete(id) {
    if (window.confirm('确认删除此供应商及其所有模型？')) {
      deleteProvider(id);
    }
  }

  return (
    <div>
      <div className="section-header">
        <span className="section-title">API 供应商</span>
        {!showForm && (
          <button className="btn-primary" onClick={handleAdd}>
            + 添加
          </button>
        )}
      </div>

      {providers.length === 0 && !showForm ? (
        <div className="empty-state">
          暂无供应商<br />添加 OpenAI 兼容的 API 开始使用
        </div>
      ) : (
        <div className="provider-list">
          {providers.map(p => {
            const pModels = models.filter(m => m.providerId === p.id);
            return (
              <div key={p.id} className="provider-card">
                <div className="provider-card-header">
                  <label className="toggle-switch" title={p.enabled ? '点击禁用' : '点击启用'}>
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={() => toggleProvider(p.id)}
                    />
                    <span className="toggle-slider" />
                  </label>
                  <span className="provider-name">{p.name}</span>
                  <span className={`badge ${p.enabled ? 'badge-active' : 'badge-disabled'}`}>
                    {p.enabled ? '启用' : '禁用'}
                  </span>
                </div>
                <div className="provider-url">{p.baseUrl}</div>
                {pModels.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    模型：{pModels.map(m => m.name).join(', ')}
                  </div>
                )}
                <div className="provider-actions">
                  <button
                    className="btn-secondary"
                    style={{ padding: '4px 12px', fontSize: 12 }}
                    onClick={() => handleEdit(p)}
                  >
                    编辑
                  </button>
                  <button
                    className="btn-danger"
                    style={{ padding: '4px 12px', fontSize: 12 }}
                    onClick={() => handleDelete(p.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <ProviderForm provider={editingProvider} onClose={handleClose} />
      )}
    </div>
  );
}

function McpTab() {
  return (
    <div className="mcp-coming-soon">
      <div className="mcp-coming-soon-icon">🔌</div>
      <h3>MCP 工具</h3>
      <p>即将支持</p>
      <p style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
        Model Context Protocol 工具集成正在开发中，敬请期待。
      </p>
    </div>
  );
}

function ThemeTab() {
  return (
    <div>
      <div className="section-header">
        <span className="section-title">外观主题</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        选择应用的显示主题
      </p>
      <ThemeOptions />
    </div>
  );
}

export default function Settings({ onClose }) {
  const { settingsTab, setSettingsTab } = useApp();

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="settings-overlay" onClick={handleOverlayClick}>
      <div className="settings-panel" role="dialog" aria-label="设置">
        <div className="settings-header">
          <h2>设置</h2>
          <button className="settings-close-btn" onClick={onClose} aria-label="关闭设置">
            ✕
          </button>
        </div>

        <div className="settings-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`settings-tab ${settingsTab === tab.id ? 'active' : ''}`}
              onClick={() => setSettingsTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="settings-content">
          {settingsTab === 'providers' && <ProvidersTab />}
          {settingsTab === 'memory' && <MemoryLibrary />}
          {settingsTab === 'mcp' && <McpTab />}
          {settingsTab === 'theme' && <ThemeTab />}
        </div>
      </div>
    </div>
  );
}
