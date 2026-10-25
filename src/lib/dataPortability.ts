const LOCAL_DATA_KEYS = [
  "mq-save",
  "mq-quest",
  "mq-achievements",
  "mq-ai-companion",
  "mq-ai-consent",
  "mq-muted",
  "mq-convoy",
] as const;

export function exportLocalData(): void {
  const data = Object.fromEntries(
    LOCAL_DATA_KEYS.map((key) => {
      const raw = localStorage.getItem(key);
      if (raw === null) return [key, null];
      try {
        return [key, JSON.parse(raw)];
      } catch {
        return [key, raw];
      }
    })
  );
  const blob = new Blob(
    [JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `meowquest-data-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function clearLocalData(): void {
  LOCAL_DATA_KEYS.forEach((key) => localStorage.removeItem(key));
  window.location.reload();
}
