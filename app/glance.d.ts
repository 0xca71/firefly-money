// Types for app/glance.js (plain JavaScript run by nginx's njs), so the tests can import it.
export interface Glance { currency: string, balance: number, cardsOwed: number, billsDue: number, buffer: number, days: number, safeToSpend: number,
  nextBill: { name: string, date: string, inDays: number, amount: number, overdue: boolean } | null }
declare const glance: {
  endpoint(r: unknown): Promise<void>,
  glance(accounts: unknown[], bills: unknown[], o: { today: string, days: number, buffer: number }): Glance,
  words(g: Glance): string,
};
export default glance;
