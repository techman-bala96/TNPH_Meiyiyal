export function exportFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `meiyiyal-my-data-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}
