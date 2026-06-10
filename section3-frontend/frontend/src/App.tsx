import { useState, useCallback } from 'react';
import ChatWindow from './ChatWindow';
import { sendMessage, HistoryItem } from './api';

export interface Message {
  id: number;
  role: 'user' | 'bot';
  text: string;
  sources?: string[];
  followUps?: string[];
}

const WELCOME: Message = {
  id: 0,
  role: 'bot',
  text: 'שלום! אני העוזר החכם של קבוצת גבאי. אשמח לסייע לך בשאלות על פרויקטים, פינוי-בינוי, תמ"א 38 ועוד.',
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [loading, setLoading] = useState(false);

  const handleSend = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { id: Date.now(), role: 'user', text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // Build conversation history (skip the static welcome message, id=0).
      // Map 'bot' → 'assistant' to match OpenAI's role convention.
      const history: HistoryItem[] = messages
        .filter(m => m.id !== 0)
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.text,
        }));

      const { answer, sources, followUps } = await sendMessage(trimmed, history);
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'bot', text: answer, sources, followUps },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'bot', text: 'מצטערים, אירעה שגיאה. אנא נסה שוב.' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages]);

  // Show follow-up chips from the last bot reply, or fall back to static chips.
  const lastBotMsg = [...messages].reverse().find(m => m.role === 'bot');
  const activeFollowUps = (lastBotMsg?.followUps ?? []).length > 0
    ? lastBotMsg!.followUps!
    : undefined; // undefined = SuggestedChips uses its static defaults

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <span className="header-logo">G</span>
          <div className="header-text">
            <span className="header-title">קבוצת גבאי</span>
            <span className="header-subtitle">עוזר חכם</span>
          </div>
        </div>
      </header>
      <ChatWindow
        messages={messages}
        loading={loading}
        onSend={handleSend}
        followUpChips={activeFollowUps}
      />
    </div>
  );
}
