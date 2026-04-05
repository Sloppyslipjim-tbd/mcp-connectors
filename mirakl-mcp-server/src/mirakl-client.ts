/**
 * Mirakl API Client
 * Handles authentication and API calls to Mirakl marketplace endpoints
 *
 * Note: Known issue with 401 errors in scheduled tasks - auth token verification needed
 */

interface MarketplaceConfig {
  apiKey: string;
  baseUrl: string;
}

export class MiraklClient {
  private configMap: Map<string, MarketplaceConfig>;

  constructor(configMap: Record<string, MarketplaceConfig>) {
    this.configMap = new Map(Object.entries(configMap));
  }

  private getConfig(marketplace: string): MarketplaceConfig {
    const config = this.configMap.get(marketplace.toLowerCase());
    if (!config) { throw new Error(`Unknown marketplace: ${marketplace}. Available: ${Array.from(this.configMap.keys()).join(", ")}`); }
    return config;
  }

  async getOrders(marketplace: string, orderStateCodes?: string[]): Promise<Record<string, unknown>> {
    const config = this.getConfig(marketplace);
    const codes = orderStateCodes || ["WAITING_ACCEPTANCE", "SHIPPING"];
    const params = new URLSearchParams();
    codes.forEach((code) => params.append("order_state_codes", code));
    const response = await fetch(`${config.baseUrl}/api/orders?${params.toString()}`, { method: "GET", headers: { Authorization: config.apiKey, "Content-Type": "application/json" } });
    if (response.status === 401) throw new Error(`Auth failed for ${marketplace}. Check API key.`);
    if (!response.ok) throw new Error(`API error ${response.status}: ${await response.text()}`);
    return (await response.json()) as Record<string, unknown>;
  }

  async getOffers(marketplace: string): Promise<Record<string, unknown>> {
    const config = this.getConfig(marketplace);
    const response = await fetch(`${config.baseUrl}/api/offers`, { method: "GET", headers: { Authorization: config.apiKey, "Content-Type": "application/json" } });
    if (response.status === 401) throw new Error(`Auth failed for ${marketplace}. Check API key.`);
    if (!response.ok) throw new Error(`API error ${response.status}: ${await response.text()}`);
    return (await response.json()) as Record<string, unknown>;
  }

  async getMessages(marketplace: string): Promise<Record<string, unknown>> {
    const config = this.getConfig(marketplace);
    const response = await fetch(`${config.baseUrl}/api/messages`, { method: "GET", headers: { Authorization: config.apiKey, "Content-Type": "application/json" } });
    if (response.status === 401) throw new Error(`Auth failed for ${marketplace}. Check API key.`);
    if (!response.ok) throw new Error(`API error ${response.status}: ${await response.text()}`);
    return (await response.json()) as Record<string, unknown>;
  }

  async getShippingInfo(marketplace: string): Promise<Record<string, unknown>> {
    const config = this.getConfig(marketplace);
    const response = await fetch(`${config.baseUrl}/api/shipping/orders`, { method: "GET", headers: { Authorization: config.apiKey, "Content-Type": "application/json" } });
    if (response.status === 401) throw new Error(`Auth failed for ${marketplace}. Check API key.`);
    if (!response.ok) throw new Error(`API error ${response.status}: ${await response.text()}`);
    return (await response.json()) as Record<string, unknown>;
  }
}
