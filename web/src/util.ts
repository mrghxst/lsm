export function etaLabel(eta: string): string {
  return eta === 'now' ? 'now' : `~${eta}`;
}

export function plusMinutes(mins: number): string {
  const d = new Date(Date.now() + mins * 60_000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
