export function isAllowedGroup(chatId: number, chatType: string, allowedChatId: string): boolean {
  return (chatType === 'group' || chatType === 'supergroup')
    && Number.isSafeInteger(chatId)
    && chatId < 0
    && String(chatId) === allowedChatId.trim();
}

// Hash to a fixed length before comparison; never accept an unset secret.
export async function hasValidWebhookSecret(request: Request, secret?: string): Promise<boolean> {
  const supplied = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!secret || !supplied) return false;
  const encoder = new TextEncoder();
  const [expected, actual] = await Promise.all(
    [secret, supplied].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value)))
  );
  const a = new Uint8Array(expected);
  const b = new Uint8Array(actual);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
