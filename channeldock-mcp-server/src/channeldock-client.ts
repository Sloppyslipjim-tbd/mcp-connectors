/**
 * ChannelDock API V2 Client
 *
 * UPDATED (2026-04-06):
 * Migrated from V1 (app.channeldock.com/api/v1) to V2.
 * V2 base URL: https://channeldock.com/portal/api/v2
 * All Seller endpoints use /seller/ prefix.
 * Auth: api_key + api_secret custom headers.
 * Confirmed working via Make.com HTTP tests:
 *   /seller/products ✅  /seller/orders ✅  /seller/stocklocations ✅
 */

interface ApiRequestOptions {
  method?: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
}

export class ChannelDockClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private maxRetries = 3;
  private retryDelay = 1000;

  constructor(apiKey: string, apiSecret: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getHeaders(): Record<string, string> {
    return {
      "api_key": this.apiKey,
      "api_secret": this.apiSecret,
      "Accept": "application/json",
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const method = options.method || "GET";
    let url = `${this.baseUrl}${endpoint}`;

    if (options.params) {
      const qs = new URLSearchParams(options.params).toString();
      if (qs) url += `?${qs}`;
    }

    const headers = this.getHeaders();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[ChannelDock] ${method} ${url} (attempt ${attempt + 1})`);

        const response = await fetch(url, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          redirect: "follow",
        });

        const contentType = response.headers.get("content-type");

        if (contentType?.includes("text/html")) {
          throw new Error(
            `ChannelDock returned HTML instead of JSON. URL: "${url}". ` +
            `This usually means the endpoint path is wrong or auth failed.`
          );
        }

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`ChannelDock API ${response.status}: ${errorBody || response.statusText}`);
        }

        const data = await response.json();
        console.log(`[ChannelDock] ✅ ${method} ${endpoint} — success`);
        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry HTML responses (wrong endpoint) or 4xx errors
        if (lastError.message.includes("HTML instead of JSON")) throw lastError;
        if (lastError.message.match(/ChannelDock API 4\d\d/)) throw lastError;

        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          console.log(`[ChannelDock] Retry ${attempt + 1}/${this.maxRetries} in ${delay}ms — ${lastError.message}`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error("ChannelDock API request failed after all retries");
  }

  // --- Seller Endpoints (V2) ---

  async getOrders(page?: number, status?: string): Promise<unknown[]> {
    const params: Record<string, string> = {};
    if (page !== undefined) params.page = String(page);
    if (status) params.status = status;

    const response = await this.request<unknown>("/seller/orders", { params });
    // V2 may return array directly or wrapped in { orders: [...] }
    if (Array.isArray(response)) return response;
    const obj = response as Record<string, unknown>;
    if (Array.isArray(obj.orders)) return obj.orders;
    if (Array.isArray(obj.data)) return obj.data;
    return [obj]; // Single result fallback
  }

  async getProducts(page?: number): Promise<unknown[]> {
    const params: Record<string, string> = {};
    if (page !== undefined) params.page = String(page);

    const response = await this.request<unknown>("/seller/products", { params });
    if (Array.isArray(response)) return response;
    const obj = response as Record<string, unknown>;
    if (Array.isArray(obj.products)) return obj.products;
    if (Array.isArray(obj.data)) return obj.data;
    return [obj];
  }

  async getStockLocations(): Promise<unknown> {
    return await this.request<unknown>("/seller/stocklocations");
  }

  async getShipments(page?: number): Promise<unknown[]> {
    const params: Record<string, string> = {};
    if (page !== undefined) params.page = String(page);

    const response = await this.request<unknown>("/seller/shipments", { params });
    if (Array.isArray(response)) return response;
    const obj = response as Record<string, unknown>;
    if (Array.isArray(obj.shipments)) return obj.shipments;
    if (Array.isArray(obj.data)) return obj.data;
    return [obj];
  }

  async getReturns(page?: number): Promise<unknown[]> {
    const params: Record<string, string> = {};
    if (page !== undefined) params.page = String(page);

    const response = await this.request<unknown>("/seller/returns", { params });
    if (Array.isArray(response)) return response;
    const obj = response as Record<string, unknown>;
    if (Array.isArray(obj.returns)) return obj.returns;
    if (Array.isArray(obj.data)) return obj.data;
    return [obj];
  }

  async getOosProducts(): Promise<Record<string, unknown>[]> {
    // Get stock locations data and filter for out-of-stock items
    const stockData = await this.getStockLocations() as Record<string, unknown>;

    // Try common response shapes
    const items = stockData.stock ?? stockData.data ?? stockData.stocklocations ?? stockData;
    const stockArr = Array.isArray(items) ? items : [];

    const oosItems: Record<string, unknown>[] = stockArr.filter(
      (item: Record<string, unknown>) => {
        const qty = (item.quantity ?? item.stock ?? item.available) as number | undefined;
        return qty !== undefined && qty <= 0;
      }
    );

    return oosItems;
  }

  // Keep backward compatibility aliases
  async getInventory(): Promise<unknown> {
    return await this.getProducts();
  }

  async getStockLevels(): Promise<unknown> {
    return await this.getStockLocations();
  }
}
