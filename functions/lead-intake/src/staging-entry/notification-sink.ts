export async function discardStagingNotification(): Promise<void> {
  // Staging persists the lead in its isolated YDB, then acknowledges delivery without external side effects.
}
