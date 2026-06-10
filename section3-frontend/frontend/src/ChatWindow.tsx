import { useRef, useEffect, useState } from 'react';
import { Message } from './App';
import MessageBubble from './MessageBubble';
import SuggestedChips from './SuggestedChips';

interface Props {
  messages: Message[];
  loading: boolean;
  onSend: (text: string) => void;
}

export default function ChatWindow({ messages, loading, onSend }: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    onSend(trimmed);
    setInput('');
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  return (
    <div className="chat-window">
      <div className="messages-area">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {loading && (
          <div className="typing-indicator" aria-label="מקליד...">
            <span /><span /><span />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="input-area">
        <SuggestedChips onChipClick={submit} />
        <form className="input-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="input-field"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="שאל שאלה..."
            disabled={loading}
            dir="rtl"
            maxLength={500}
            autoComplete="off"
          />
          <button
            className="send-btn"
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="שלח"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
