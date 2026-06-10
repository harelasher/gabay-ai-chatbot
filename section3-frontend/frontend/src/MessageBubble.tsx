import { Message } from './App';

interface Props {
  message: Message;
}

function isHebrew(text: string): boolean {
  return /[֐-׿יִ-ﭏ]/.test(text.slice(0, 60));
}

function sourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const dir = isHebrew(message.text) ? 'rtl' : 'ltr';

  return (
    <div className={`bubble-row ${isUser ? 'bubble-row--user' : 'bubble-row--bot'}`}>
      <div
        className={`bubble ${isUser ? 'bubble--user' : 'bubble--bot'}`}
        dir={dir}
      >
        <p className="bubble-text">{message.text}</p>

        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="sources" dir="ltr">
            <span className="sources-label">מקורות:</span>
            {message.sources.map(url => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="source-link"
              >
                {sourceLabel(url)}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
