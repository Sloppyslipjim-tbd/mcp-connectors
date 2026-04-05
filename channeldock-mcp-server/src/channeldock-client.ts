/**
 * ChannelDock API Client
 *
 * FIX APPLIED (2026-04-05):
 * ROOT CAUSE: app.channeldock.com 301-redirects to channeldock.com.
 * Node.js fetch follows the redirect but DROPS custom headers (api_key, api_secret)
 * on cross-origin redirects. ChannelDock then serves HTML (login page) without auth.
 *
 * FIXES:
 * 1. Base URL changed from app.channeldock.com to channeldock.com (skip redirect)
 * 2. Added Bearer token auth as primary method (api_key/api_secret as fallback)
 * 3. Disabled automatic redirects (redirect: "manual") to detect URL issues
 * 4. Tries multiple auth strategies before failing
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

  /**
   * Try multiple auth strategies in order:
   * 1. Bearer token (api_key as token) — most common for modern APIs
   * 2. Custom headers (api_key + api_secret) — original implementation
   * 3. Query params (?api_key=...&api_secret=...) — some APIs use this
   */
  private getAuthStrategies(): Record<string, string>[] {
    return [
      // Strategy 1: Bearer token
      {
        "Authorization": `Bearer ${this.apiKey}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      // Strategy 2: Custom headers (original)
      {
        "api_key": this.apiKey,
        "api_secret": this.apiSecret,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      // Strategy 3: X-Api-Key header pattern
      {
        "X-Api-Key": this.apiKey,
        "X-Api-Secret": this.apiSecret,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    ];
  }

  private async request<T>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const method = options.method || "GET";
    const url = `${this.baseUrl}${endpoint}`;
    const authStrategies = this.getAuthStrategies();

    let lastError: Error | null = null;

    // Try each auth strategy
    for (let stratIdx = 0; stratIdx < authStrategies.length; stratIdx++) {
      const headers = authStrategies[stratIdx];

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          redirect: "manual", // Don't auto-follow redirects (they strip headers)
        });

        // Handle redirects manually — preserve headers
        if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
          const redirectUrl = response.headers.get("location");
          if (redirectUrl) {
            console.log(`Redirect detected: ${url} → ${redirectUrl}. Following with headers preserved.`);
            const redirectResponse = await fetch(redirectUrl, {
              method,
              headers, // Keep same headers!
              body: options.body ? JSON.stringify(options.body) : undefined,
              redirect: "manual",
            });

            const contentType = redirectResponse.headers.get("content-type");
            if (this.isHtmlResponse(contentType)) {
              console.log(`Auth strategy ${stratIdx + 1} returned HTML after redirect, trying next...`);
              lastError = new Error(`Auth strategy ${stratIdx + 1} failed: HTML response after redirect to ${redirectUrl}`);
              continue;
            }

            if (!redirectResponse.ok) {
              const error = await redirectResponse.text();
              lastError = new Error(`API Error ${redirectResponse.status} (after redirect): ${error || redirectResponse.statusText}`);
              continue;
            }

            return await redirectResponse.json() as T;
          }
        }

        const contentType = response.headers.get("content-type");

        if (this.isHtmlResponse(contentType)) {
          console.log(`Auth strategy ${stratIdx + 1} returned HTML for ${endpoint}, trying next...`);
          lastError = new Error(`Auth strategy ${stratIdx + 1} failed: HTML response from ${url}`);
          continue; // Try next auth strategy instead of throwing immediately
        }

        if (!response.ok) {
          const error = await response.text();
          lastError = new Error(`API Error ${response.status}: ${error || response.statusText}`);
          // 401/403 means wrong auth — try next strategy
          if (response.status === 401 || response.status === 403) {
            console.log(`Auth strategy ${stratIdx + 1} returned ${response.status}, trying next...`);
            continue;
          }
          throw lastError;
        }

        const data = await response.json();
        console.log(`✅ Auth strategy ${stratIdx + 1} succeeded for ${endpoint}`);
        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (stratIdx < authStrategies.length - 1) {
          console.log(`Auth strategy ${stratIdx + 1} failed: ${lastError.message}. Trying next...`);
          continue;
        }
      }
    }

    // All strategies failed — now retry with exponential backoff using strategy 1 (Bearer)
    const primaryHeaders = authStrategies[0];
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: primaryHeaders,
          body: options.body ? JSON.stringify(options.body) : undefined,
          redirect: "follow",
        });

        const contentType = response.headers.get("content-type");
        if (this.isHtmlResponse(contentType)) {
          throw new Error(
            `ChannelDock API returned HTML instead of JSON on all auth strategies. ` +
              `Endpoint: "${endpoint}", URL: "${url}". ` +
              `Content-Type: ${contentType}. ` +
              `Check: 1) Base URL is correct  2) API key is valid  3) Endpoint path exists`
          );
        }

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`API Error ${response.status}: ${error || response.statusText}`);
        }

        return await response.json() as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError.message.includes("returned HTML")) throw lastError;

        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          console.log(`Retry ${attempt + 1}/${this.maxRetries} after ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error("Failed to fetch from ChannelDock API after all auth strategies and retries");
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
