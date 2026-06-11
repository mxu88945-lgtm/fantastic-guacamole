/**
 * Streaming API call for OpenAI-compatible endpoints
 */

export async function streamChat({ provider, model, messages, onChunk, onDone, onError, signal }) {
  const url = `${provider.baseUrl}${provider.path || '/chat/completions'}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') return;
    onError(err.message || '网络请求失败');
    return;
  }

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const errData = await res.json();
      errMsg = errData?.error?.message || errMsg;
    } catch {}
    onError(errMsg);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          onDone();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta;

          // MCP_TOOL_HOOK: if delta contains tool_calls, handle MCP tools here
          // Example future implementation:
          // if (delta?.tool_calls) {
          //   for (const toolCall of delta.tool_calls) {
          //     const result = await callMcpTool(toolCall);
          //     // inject tool result back into messages
          //   }
          // }

          const text = delta?.content;
          if (text) onChunk(text);
        } catch {
          // skip invalid JSON lines
        }
      }
    }
    onDone();
  } catch (err) {
    if (err.name === 'AbortError') return;
    onError(err.message || '流式读取失败');
  }
}
