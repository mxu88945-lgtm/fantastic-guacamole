export default function MessageBubble({ message, isStreaming }) {
  const { role, content } = message;
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';

  if (role === 'error') {
    return (
      <div className="message-row assistant">
        <div className="message-error">⚠️ {content}</div>
      </div>
    );
  }

  return (
    <div className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-bubble">
        {isAssistant && isStreaming && !content ? (
          <div className="loading-dots">
            <span className="loading-dot" />
            <span className="loading-dot" />
            <span className="loading-dot" />
          </div>
        ) : (
          <>
            {content}
            {isAssistant && isStreaming && (
              <span className="message-cursor" aria-hidden="true" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
