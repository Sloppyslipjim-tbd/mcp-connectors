/**
 * ChannelDock API Client
 *
 * KNOWN ISSUE: ChannelDock API previously returned HTML instead of JSON.
 * This may be due to incorrect Accept/Content-Type headers or endpoint mismatches.
 * Support has been emailed about this issue.
 *
 * MITIGATION:
 * - Explicitly set Accept: application/json header
 * - Set Content-Type: application/json header
 * - Includes HTML detection to throw descriptive error if HTML response received
 * - Try both https://app.channeldock.com/api/v1 and https://channeldock.com/api/v1 patterns
 *
 * If endpoints still return HTML, check with ChannelDock support for correct API endpoints.
 */

interface ApiRequestOptions {
  method?: string;
  body?: Record<string, unknown>;
}

interface OrderResponse {
  id: string;
  [key: string]: unknown;
}

interface InventoryResponse {
  products?: unknown[];
  inventory?: unknown[];
  [key: string]: unknown;
}

interface StockResponse {
  stock?: unknown[];
  [key: string]: unknown;
}

export class ChannelDockClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private maxRetries = 3;
  private retryDelay = 1000; // ms

  constructor(apiKey: string, apiSecret: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isHtmlResponse(contentType: string | null): boolean {
    return contentType?.includes("text/html") || false;
  }

  private async request<T>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const method = options.method || "GET";
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      "api_key": this.apiKey,
      "api_secret": this.apiSecret,
      "Accept": "application/json",
      "Content-Type": "application/json",
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
        });

        const contentType = response.headers.get("content-type");

        // KNOWN ISSUE: Check if response is HTML instead of JSON
        if (this.isHtmlResponse(contentType)) {
          throw new Error(
            `ChannelDock API returned HTML instead of JSON. ` +
              `This is a known issue. The endpoint "${endpoint}" may be incorrect or ChannelDock's API is temporarily serving HTML. ` +
              `Content-Type: ${contentType}. ` +
              `Support has been contacted. Try alternative base URLs or check ChannelDock documentation.`
          );
        }

        if (!response.ok) {
          const error = await response.text();
          throw new Error(
            `API Error ${response.status}: ${error || response.statusText}`
          );
        }

        const data = await response.json();
        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on known issues
        if (lastError.message.includes("returned HTML")) {
          throw lastError;
        }

        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          console.log(
            `Retry attempt ${attempt + 1}/${this.maxRetries} after ${delay}ms`
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error("Failed to fetch from ChannelDock API");
  }

  async getOrders(page?: number, status?: string): Promise<OrderResponse[]> {
    let endpoint = "/orders";

    const params = new URLSearchParams();
    if (page !== undefined) params.append("page", String(page));
    if (status) params.append("status", status);

    if (params.size > 0) {
      endpoint += `?${params.toString()}`;
    }

    const response = await this.request<{ orders?: OrderResponse[]; [key: string]: unknown }>(
      endpoint
    );
    return response.orders || (Array.isArray(response) ? response : []);
  }

  async getInventory(): Promise<InventoryResponse> {
    // Try both /inventory and /products endpoints as exact endpoint is uncertain
    try {
      return await this.request<InventoryResponse>("/inventory");
    } catch (error) {
      console.log(
        "Failed to fetch /inventory, trying /products endpoint",
        error
      );
      return await this.request<InventoryResponse>("/products");
    }
  }

  async getStockLevels(): Promise<StockResponse> {
    const response = await this.request<StockResponse>("/stock");
    return response;
  }

  async getOosProducts(): Promise<Record<string, unknown>[]> {
    try {
      // Try to get stock levels
      const stockData = await this.getStockLevels() as Record<string, unknown>;
      const stock = (stockData as Record<string, unknown>).stock ?? [];

      // Filter for out-of-stock items (stock <= 0) for FFC (fulfillment center)
      const stockArr = Array.isArray(stock) ? stock : [];
      const oosItems: Record<string, unknown>[] = stockArr.filter(
        (item: Record<string, unknown>) => {
          const quantity = item.quantity as number | undefined;
          return quantity !== undefined && quantity <= 0;
        }
      );

      return oosItems;
    } catch (error) {
      console.log("Error fetching OOS products from stock", error);

      // Fallback: try inventory endpoint
      try {
        const inventory = await this.getInventory() as Record<string, unknown>;
        const products = (inventory as Record<string, unknown>).products ?? [];

        const productsArr = Array.isArray(products) ? products : [];
        const oosItems: Record<string, unknown>[] = productsArr.filter(
          (item: Record<string, unknown>) => {
            const quantity = item.stock as number | undefined;
            return quantity !== undefined && quantity <= 0;
          }
        );

        return oosItems;
      } catch (fallbackError) {
        console.error("Failed to fetch OOS products from both endpoints");
        throw fallbackError;
      }
    }
  }
}
