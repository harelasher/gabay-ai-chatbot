import { useState, useCallback } from 'react';
import ChatWindow from './ChatWindow';
import { sendMessage } from './api';

export interface Message {
  id: number;
  role: 'user' | 'bot';
  text: string;
  sources?: string[];
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
      const { answer, sources } = await sendMessage(trimmed);
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'bot', text: answer, sources },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'bot', text: 'מצטערים, אירעה שגיאה. אנא נסה שוב.' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

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
      <ChatWindow messages={messages} loading={loading} onSend={handleSend} />
    </div>
  );
}
