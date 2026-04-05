/*
 * ============================================================================
 * IMPORTANT: IMPORT4YOU API ENDPOINT VERIFICATION REQUIRED
 * ============================================================================
 *
 * NOTE: API endpoints are scaffolded based on common fulfillment API patterns.
 * The exact base URL and endpoint paths need to be verified with Import4you.
 * The Client ID auth method may also differ from what's implemented here.
 *
 * VERIFICATION NEEDED:
 * - Confirm the exact base URL (currently assumes https://api.import4you.nl/v1)
 * - Verify exact endpoint paths for stock/inventory queries
 * - Verify exact endpoint paths for shipment/tracking queries
 * - Confirm authentication header format (currently X-Client-Id or Authorization)
 * - Check if pagination is needed for stock levels or shipment results
 * - Verify response schema and field names
 *
 * Until verification is complete, treat this as a scaffold that will require
 * adjustments once the Import4you API documentation is reviewed.
 * ============================================================================
 */

interface StockLevel {
  sku: string;
  quantity: number;
  warehouseId?: string;
  lastUpdated?: string;
}

interface StockResponse {
  success: boolean;
  data?: StockLevel[];
  error?: string;
}

interface Shipment {
  orderId?: string;
  trackingNumber?: string;
  status: string;
  carrier?: string;
  estimatedDelivery?: string;
  lastUpdate?: string;
}

interface ShipmentResponse {
  success: boolean;
  data?: Shipment[];
  error?: string;
}

export class Import4youClient {
  private baseUrl: string;
  private clientId: string;

  constructor(baseUrl: string, clientId: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.clientId = clientId;
  }

  /**
   * Fetch current stock levels from Import4you fulfillment warehouse.
   * Optionally filter by SKU.
   *
   * ENDPOINT TO VERIFY: GET /stock or /inventory
   */
  async getStockLevels(sku?: string): Promise<StockResponse> {
    try {
      let url = `${this.baseUrl}/stock`;
      if (sku) {
        url += `?sku=${encodeURIComponent(sku)}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: this._getHeaders(),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}.
            Note: Endpoint path may need verification with Import4you API docs.`,
        };
      }

      const data = await response.json() as Record<string, unknown>;
      return {
        success: true,
        data: (data as Record<string, unknown>).items || (data as Record<string, unknown>).stock || data,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch stock levels: ${error instanceof Error ? error.message : String(error)}.
          Note: Verify that the endpoint /stock exists and Client ID auth method is correct.`,
      };
    }
  }

  /**
   * Fetch shipment status and tracking information.
   * Optionally filter by order ID or tracking number.
   *
   * ENDPOINT TO VERIFY: GET /shipments or /orders/{orderId}/shipments
   */
  async getShipmentStatus(
    orderId?: string,
    trackingNumber?: string
  ): Promise<ShipmentResponse> {
    try {
      let url = `${this.baseUrl}/shipments`;

      const params = new URLSearchParams();
      if (orderId) {
        params.append('orderId', orderId);
      }
      if (trackingNumber) {
        params.append('trackingNumber', trackingNumber);
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: this._getHeaders(),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}.
            Note: Endpoint path may need verification with Import4you API docs.`,
        };
      }

      const data = await response.json() as Record<string, unknown>;
      return {
        success: true,
        data: (data as Record<string, unknown>).shipments || (data as Record<string, unknown>).items || data,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch shipment status: ${error instanceof Error ? error.message : String(error)}.
          Note: Verify that the endpoint /shipments exists and Client ID auth method is correct.`,
      };
    }
  }

  /**
   * Private helper to construct request headers.
   * Currently tries X-Client-Id header; adjust if API uses Authorization Bearer or other scheme.
   */
  private _getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Client-Id': this.clientId,
      // Alternative if the API uses Authorization Bearer:
      // 'Authorization': `Bearer ${this.clientId}`,
    };
  }
}
