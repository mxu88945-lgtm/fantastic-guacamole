import { useApp } from './store.js';
import Sidebar from './components/Sidebar.jsx';
import ChatArea from './components/ChatArea.jsx';
import Settings from './components/Settings.jsx';

export default function App() {
  const { settingsOpen, setSettingsOpen, sidebarOpen, setSidebarOpen } = useApp();

  return (
    <div className="app-layout">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar />

      <div className="main-area">
        <ChatArea onOpenSidebar={() => setSidebarOpen(true)} />
      </div>

      {settingsOpen && (
        <Settings onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
