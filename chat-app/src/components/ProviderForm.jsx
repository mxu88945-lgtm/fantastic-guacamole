import { useState } from 'react';
import { useApp } from '../store.jsx';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_PATH = '/chat/completions';

export default function ProviderForm({ provider, onClose }) {
  const { addProvider, editProvider, addModel, models } = useApp();
  const isEdit = !!provider;

  const [name, setName] = useState(provider?.name || '');
  const [apiKey, setApiKey] = useState(provider?.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl || DEFAULT_BASE_URL);
  const [path, setPath] = useState(provider?.path || DEFAULT_PATH);
  const [showKey, setShowKey] = useState(false);
  const [modelInput, setModelInput] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('请输入供应商名称'); return; }
    if (!apiKey.trim()) { setError('请输入 API Key'); return; }
    if (!baseUrl.trim()) { setError('请输入 Base URL'); return; }

    const data = {
      name: name.trim(),
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim().replace(/\/$/, ''),
      path: path.trim() || DEFAULT_PATH,
    };

    if (isEdit) {
      editProvider(provider.id, data);
    } else {
      const newProvider = addProvider(data);
      // auto-add model if user typed one
      if (modelInput.trim()) {
        addModel({ name: modelInput.trim(), providerId: newProvider.id });
      }
    }
    onClose();
  }

  // For edit mode: manage models directly
  const providerModels = isEdit ? models.filter(m => m.providerId === provider.id) : [];
  const { deleteModel } = useApp();

  function handleAddModel() {
    if (!modelInput.trim()) return;
    addModel({ name: modelInput.trim(), providerId: provider.id });
    setModelInput('');
  }

  return (
    <div className="provider-form">
      <h3>{isEdit ? '编辑供应商' : '添加供应商'}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">名称 *</label>
          <input
            className="form-input"
            placeholder="例如：OpenAI、Deepseek..."
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">API Key *</label>
          <div style={{ position: 'relative' }}>
            <input
              className={`form-input password-input`}
              type={showKey ? 'text' : 'password'}
              placeholder="sk-..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              style={{ paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              style={{
                position: 'absolute', right: 10, top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)', fontSize: 14,
              }}
              aria-label={showKey ? '隐藏密钥' : '显示密钥'}
            >
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Base URL</label>
          <input
            className="form-input"
            placeholder={DEFAULT_BASE_URL}
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">路径 (Path)</label>
          <input
            className="form-input"
            placeholder={DEFAULT_PATH}
            value={path}
            onChange={e => setPath(e.target.value)}
          />
        </div>

        {/* Model management */}
        <div className="form-group">
          <label className="form-label">
            {isEdit ? '添加模型' : '模型名称 (可选)'}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              placeholder="例如：gpt-4o、deepseek-chat..."
              value={modelInput}
              onChange={e => setModelInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && isEdit) {
                  e.preventDefault();
                  handleAddModel();
                }
              }}
              style={{ flex: 1 }}
            />
            {isEdit && (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleAddModel}
                style={{ flexShrink: 0 }}
              >
                添加
              </button>
            )}
          </div>
        </div>

        {isEdit && providerModels.length > 0 && (
          <div className="model-list" style={{ marginTop: 8, marginBottom: 14 }}>
            {providerModels.map(m => (
              <div key={m.id} className="model-item">
                <span className="model-item-name">{m.name}</span>
                <button
                  type="button"
                  className="btn-danger"
                  style={{ padding: '3px 10px', fontSize: 12 }}
                  onClick={() => deleteModel(m.id)}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 10 }}>
            {error}
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn-primary">
            {isEdit ? '保存' : '添加'}
          </button>
        </div>
      </form>
    </div>
  );
}
