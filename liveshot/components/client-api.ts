export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers }, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The machine could not respond. Please try again.');
  return data as T;
}
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
