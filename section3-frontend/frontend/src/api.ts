export interface HistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  answer: string;
  sources: string[];
  followUps: string[];
}

export async function sendMessage(
  message: string,
  history: HistoryItem[] = [],
): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? 'שגיאה בשרת');
  }
  const data = await res.json() as ChatResponse;
  return { ...data, followUps: data.followUps ?? [] };
}
