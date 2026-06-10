export interface ChatResponse {
  answer: string;
  sources: string[];
}

export async function sendMessage(message: string): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? 'שגיאה בשרת');
  }
  return res.json() as Promise<ChatResponse>;
}
