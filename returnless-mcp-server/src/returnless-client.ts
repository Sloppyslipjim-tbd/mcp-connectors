const DEFAULT_RATE_LIMIT_RETRY_MS = 1000;
const MAX_RETRIES = 3;

interface ReturnOrder {
  id: string;
  reason: string;
  status: string;
  product_id?: string;
  product_name?: string;
  created_at?: string;
  [key: string]: unknown;
}

interface ReturnStats {
  total_returns: number;
  by_reason: Record<string, number>;
  by_status: Record<string, number>;
  top_products_by_return_count: Array<{ product: string; count: number }>;
}

export class ReturnlessClient {
  private bearerToken: string;
  private baseUrl: string;

  constructor(bearerToken: string, baseUrl: string) {
    this.bearerToken = bearerToken;
    this.baseUrl = baseUrl;
  }

  private async makeRequest(endpoint: string, queryParams?: Record<string, unknown>): Promise<unknown> {
    const url = new URL(endpoint, this.baseUrl);
    if (queryParams) { Object.entries(queryParams).forEach(([key, value]) => { if (value !== undefined && value !== null) url.searchParams.append(key, String(value)); }); }
    let lastError = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url.toString(), { method: "GET", headers: { Authorization: `Bearer ${this.bearerToken}`, "Content-Type": "application/json" } });
        if (response.status === 429) { const ra = response.headers.get("Retry-After"); await new Promise(r => setTimeout(r, ra ? parseInt(ra) * 1000 : DEFAULT_RATE_LIMIT_RETRY_MS)); continue; }
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        return await response.json();
      } catch (error) { lastError = error; if (attempt < MAX_RETRIES - 1) await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); }
    }
    throw lastError || new Error("Failed to fetch from Returnless API");
  }

  async getReturnOrders(limit?: number, page?: number, status?: string): Promise<ReturnOrder[]> {
    const qp: Record<string, unknown> = {};
    if (limit !== undefined) qp.limit = limit;
    if (page !== undefined) qp.page = page;
    if (status !== undefined) qp.status = status;
    const data = (await this.makeRequest("return-orders", qp)) as { data?: ReturnOrder[]; results?: ReturnOrder[] };
    return data.data || data.results || [];
  }

  async getReturnStats(startDate?: string, endDate?: string): Promise<ReturnStats> {
    const orders = await this.getReturnOrders(100, 1);
    if (!Array.isArray(orders) || orders.length === 0) return { total_returns: 0, by_reason: {}, by_status: {}, top_products_by_return_count: [] };
    const filtered = orders.filter(o => {
      if (startDate && o.created_at && new Date(o.created_at) < new Date(startDate)) return false;
      if (endDate && o.created_at && new Date(o.created_at) > new Date(endDate)) return false;
      return true;
    });
    const byReason: Record<string, number> = {}, byStatus: Record<string, number> = {}, pc: Record<string, number> = {};
    filtered.forEach(o => {
      if (o.reason) byReason[o.reason] = (byReason[o.reason] || 0) + 1;
      if (o.status) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      const pk = o.product_name || o.product_id || "Unknown"; pc[pk] = (pc[pk] || 0) + 1;
    });
    return { total_returns: filtered.length, by_reason: byReason, by_status: byStatus, top_products_by_return_count: Object.entries(pc).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([product, count]) => ({ product, count })) };
  }
}
