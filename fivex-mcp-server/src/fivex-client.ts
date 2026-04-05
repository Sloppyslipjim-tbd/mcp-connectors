/**
 * FiveX Analytics API Client
 * Handles authentication, pagination, and client-side date filtering.
 *
 * Known issues (from project docs):
 * - Date params are ignored server-side → must filter client-side
 * - Max 20 orders per page → needs pagination loop
 * - Rate limit 429 → exponential backoff, 2s delay between pages
 */

export interface FiveXConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

export interface FiveXOrder {
  id: string | number;
  order_number?: string;
  channel?: string;
  status?: string;
  total?: number;
  total_incl_vat?: number;
  revenue?: number;
  currency?: string;
  created_at?: string;
  updated_at?: string;
  items?: FiveXOrderItem[];
  [key: string]: unknown;
}

export interface FiveXOrderItem {
  product_name?: string;
  sku?: string;
  quantity?: number;
  price?: number;
  [key: string]: unknown;
}

export interface FiveXReturn {
  id: string | number;
  order_id?: string | number;
  reason?: string;
  status?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface FiveXProduct {
  id: string | number;
  name?: string;
  sku?: string;
  ean?: string;
  price?: number;
  stock?: number;
  status?: string;
  [key: string]: unknown;
}

export class FiveXClient {
  private config: FiveXConfig;
  private maxRetries = 3;
  private pageDelay = 2000; // 2s between pages

  constructor(config: FiveXConfig) {
    this.config = config;
  }

  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(endpoint, this.config.baseUrl);
    url.searchParams.set("api_key", this.config.apiKey);
    url.searchParams.set("api_secret", this.config.apiSecret);
    for (const [key, value] of Object.entries(params)) { url.searchParams.set(key, value); }
    let lastError = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(url.toString(), { method: "GET", headers: { Accept: "application/json", "Content-Type": "application/json" } });
        if (response.status === 429) { const delay = Math.pow(2, attempt + 1) * 1000; await this.sleep(delay); continue; }
        if (!response.ok) { throw new Error(`FiveX API error: ${response.status} ${response.statusText}`); }
        return (await response.json()) as T;
      } catch (err) { lastError = err instanceof Error ? err : new Error(String(err)); if (attempt < this.maxRetries - 1) { await this.sleep(Math.pow(2, attempt + 1) * 1000); } }
    }
    throw lastError ?? new Error("FiveX API request failed after retries");
  }

  private async fetchAllPages<T>(endpoint: string, params: Record<string, string> = {}): Promise<T[]> {
    const allItems: T[] = []; let page = 1; let hasMore = true;
    while (hasMore) {
      const response = await this.request<T[] | { data: T[] }>(endpoint, { ...params, page: String(page) });
      const items = Array.isArray(response) ? response : Array.isArray((response as { data: T[] }).data) ? (response as { data: T[] }).data : [];
      allItems.push(...items);
      if (items.length < 20) { hasMore = false; } else { page++; await this.sleep(this.pageDelay); }
    }
    return allItems;
  }

  private filterByDate<T extends { created_at?: string }>(items: T[], startDate?: string, endDate?: string): T[] {
    return items.filter((item) => {
      if (!item.created_at) return true;
      const itemDate = item.created_at.split("T")[0];
      if (startDate && itemDate < startDate) return false;
      if (endDate && itemDate > endDate) return false;
      return true;
    });
  }

  async getOrders(startDate?: string, endDate?: string, channel?: string): Promise<FiveXOrder[]> {
    const params: Record<string, string> = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    let orders = await this.fetchAllPages<FiveXOrder>("/orders/all", params);
    orders = this.filterByDate(orders, startDate, endDate);
    if (channel) { orders = orders.filter((o) => o.channel?.toLowerCase() === channel.toLowerCase()); }
    return orders;
  }

  async getReturns(startDate?: string, endDate?: string): Promise<FiveXReturn[]> {
    const params: Record<string, string> = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    let returns = await this.fetchAllPages<FiveXReturn>("/returns/all", params);
    returns = this.filterByDate(returns, startDate, endDate);
    return returns;
  }

  async getProducts(): Promise<FiveXProduct[]> { return this.fetchAllPages<FiveXProduct>("/products/all"); }

  async getDailySalesSummary(date: string) {
    const orders = await this.getOrders(date, date);
    let totalRevenue = 0, totalUnits = 0;
    const channels: Record<string, { revenue: number; orders: number; units: number }> = {};
    const productMap: Record<string, { name: string; sku: string; revenue: number; units: number }> = {};
    for (const order of orders) {
      const revenue = order.total_incl_vat ?? order.total ?? order.revenue ?? 0;
      totalRevenue += revenue;
      const ch = order.channel ?? "Unknown";
      if (!channels[ch]) channels[ch] = { revenue: 0, orders: 0, units: 0 };
      channels[ch].revenue += revenue; channels[ch].orders += 1;
      if (order.items && Array.isArray(order.items)) {
        for (const item of order.items) {
          const qty = item.quantity ?? 1; totalUnits += qty; channels[ch].units += qty;
          const sku = item.sku ?? "unknown"; const name = item.product_name ?? sku;
          if (!productMap[sku]) productMap[sku] = { name, sku, revenue: 0, units: 0 };
          productMap[sku].revenue += (item.price ?? 0) * qty; productMap[sku].units += qty;
        }
      }
    }
    return { date, totalRevenue: Math.round(totalRevenue * 100) / 100, totalOrders: orders.length, totalUnits, channels, topProducts: Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10) };
  }

  async getSalesByChannel(startDate: string, endDate: string) {
    const orders = await this.getOrders(startDate, endDate);
    const channels: Record<string, { revenue: number; orders: number; units: number }> = {};
    for (const order of orders) {
      const ch = order.channel ?? "Unknown";
      const revenue = order.total_incl_vat ?? order.total ?? order.revenue ?? 0;
      if (!channels[ch]) channels[ch] = { revenue: 0, orders: 0, units: 0 };
      channels[ch].revenue += revenue; channels[ch].orders += 1;
      if (order.items && Array.isArray(order.items)) { for (const item of order.items) { channels[ch].units += item.quantity ?? 1; } }
    }
    for (const ch of Object.keys(channels)) { channels[ch].revenue = Math.round(channels[ch].revenue * 100) / 100; }
    return channels;
  }

  private sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
}
