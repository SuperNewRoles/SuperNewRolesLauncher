export function isOwnReportMessage(
  sender: string | undefined,
  currentUserToken: string | null,
): boolean {
  const normalizedSender = sender?.trim();
  const normalizedToken = currentUserToken?.trim();

  if (!normalizedSender || !normalizedToken) {
    return false;
  }

  return normalizedSender === normalizedToken;
}
