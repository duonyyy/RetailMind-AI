import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  Optional,
} from '@nestjs/common';
import { CatalogService } from '../catalog/public-api';
import { InventoryService } from '../inventory/public-api';
import { OrdersService } from '../orders/public-api';
import { KnowledgeService } from '../knowledge/public-api';
import { SupportService } from '../support/public-api';
import { CustomersService } from '../customers/public-api';
import { CartService, type CartDTO } from '../cart/public-api';
import Decimal from 'decimal.js';
import { DataSource } from 'typeorm';
import { getAgentOperationStatus } from '../../shared/idempotency/transactional-idempotency';

@Injectable()
export class InternalAgentService {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly inventoryService: InventoryService,
    private readonly ordersService: OrdersService,
    @Optional() private readonly knowledgeService?: KnowledgeService,
    @Optional() private readonly supportService?: SupportService,
    @Optional() private readonly customersService?: CustomersService,
    @Optional() private readonly cartService?: CartService,
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  async operationStatus(customerId: string, idempotencyKey?: string) {
    if (!this.dataSource?.isInitialized) {
      throw new ServiceUnavailableException('Dịch vụ đối soát hiện không khả dụng.');
    }
    return getAgentOperationStatus(this.dataSource.manager, customerId, idempotencyKey);
  }

  /**
   * Tool 1: Tìm kiếm laptop theo tiêu chuẩn cấu hình và giá
   */
  async searchCatalog(args: {
    query?: string;
    search?: string;
    max_price_vnd?: number;
    max_price?: number;
    min_price_vnd?: number;
    min_price?: number;
    min_ram_gb?: number;
    brand?: string;
  }) {
    const maxP = args.max_price_vnd || args.max_price;
    const minP = args.min_price_vnd || args.min_price;

    const products = await this.catalogService.getProducts({
      search: args.query || args.search,
      maxPrice: maxP ? maxP.toString() : undefined,
      minPrice: minP ? minP.toString() : undefined,
      minRam: args.min_ram_gb,
      brand: args.brand,
    });

    return {
      count: products.length,
      laptops: products.map((p) => ({
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        price_vnd: p.priceVnd,
        formatted_price: p.formattedPrice,
        ram_gb: p.ramGb,
        storage_gb: p.storageGb,
        cpu: p.cpuModel,
        gpu: p.gpuModel,
        highlights: p.highlights,
        in_stock: p.inStock,
      })),
    };
  }

  /**
   * Tool 2: Chi tiết sản phẩm & biến thể
   */
  async getProductDetails(args: { sku?: string; variant_id?: string }) {
    const targetSku = args.sku || args.variant_id;
    if (!targetSku) {
      throw new BadRequestException('Mã SKU hoặc variant_id là bắt buộc.');
    }
    const product = await this.catalogService.getProductBySku(targetSku);
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm với mã ${targetSku}.`);
    }
    return product;
  }

  /**
   * Tool 3: So sánh 2-4 mẫu laptop
   */
  async compareProducts(args: { skus?: string[]; variant_ids?: string[] }) {
    const list = args.skus || args.variant_ids || [];
    if (!list.length) {
      throw new BadRequestException('Danh sách mã sản phẩm so sánh không được rỗng.');
    }
    const comparison = await this.catalogService.compareVariants(list);
    return {
      total: comparison.length,
      comparison,
    };
  }

  /**
   * Tool 4: Kiểm tra tồn kho khả dụng tại các chi nhánh MWG
   */
  async checkInventory(args: { sku?: string; variant_id?: string; store_id?: string }) {
    const targetSku = args.sku || args.variant_id;
    if (!targetSku) {
      throw new BadRequestException('Mã SKU hoặc variant_id là bắt buộc.');
    }
    const storeRef = args.store_id || 'MWG_HCM_001';
    const stock = await this.inventoryService.getStock(storeRef, targetSku);
    return {
      sku: targetSku,
      store_id: stock.storeId,
      store_code: storeRef,
      store_name: stock.storeName,
      on_hand_qty: stock.onHandQty,
      reserved_qty: stock.reservedQty,
      available_qty: stock.availableQty,
      is_in_stock: stock.isAvailable,
    };
  }

  /**
   * Tool 5: Tra cứu chính sách bảo hành, đổi trả & hạn mức tài chính
   */
  async searchPolicy(args: { query: string; top_k?: number }) {
    if (this.knowledgeService) {
      const results = await this.knowledgeService.searchPolicy(args.query || '', args.top_k || 5);
      return {
        query: args.query,
        count: results.length,
        policies: results,
      };
    }

    const policies = [
      {
        id: 'POL_2026_RETURN',
        title: 'Chính Sách Đổi Trả & Bảo Hành RetailMind AI 2026',
        statute: 'Điều 1',
        content:
          'Khách hàng được quyền đổi trả hàng trong vòng 30 ngày kể từ ngày nhận hàng với điều kiện sản phẩm còn nguyên tem mác, nguyên hộp và hóa đơn mua hàng. Bảo hành chính hãng 24 tháng tại các trung tâm ủy quyền toàn quốc.',
        snippet: 'Đổi trả trong 30 ngày nguyên hộp, hóa đơn. Bảo hành 24 tháng chính hãng.',
      },
      {
        id: 'POL_2026_REFUND',
        title: 'Quy Chế Quản Trị Tài Chính & Hạn Mức Bồi Hoàn 2026',
        statute: 'Điều 5',
        content:
          'Mọi khoản bồi hoàn từ 200.000 VNĐ trở xuống được AI tự động duyệt. Từ 200.000 đến 2.000.000 VNĐ cần Quản lý duyệt (HITL Gate). Vượt 2.000.000 VNĐ cần Giám đốc Tài chính phê duyệt.',
        snippet: '<= 200k tự động; 200k - 2tr cần Quản lý duyệt; > 2tr cần Giám đốc Tài chính duyệt.',
      },
    ];

    const q = (args.query || '').toLowerCase();
    const matched = policies.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.snippet.toLowerCase().includes(q),
    );

    return {
      query: args.query,
      count: matched.length || policies.length,
      policies: matched.length ? matched : policies,
    };
  }

  /**
   * Tool 6: Xem giỏ hàng của khách hàng (PostgreSQL SSOT)
   */
  async viewCart(customerId: string) {
    if (!customerId || customerId === 'guest_user') {
      throw new BadRequestException('Mã khách hàng là bắt buộc để xem giỏ hàng.');
    }
    if (!this.cartService) {
      throw new ServiceUnavailableException('Dịch vụ giỏ hàng hiện không khả dụng.');
    }
    const cart = await this.cartService.getCart(customerId);
    return this.formatCart(customerId, cart);
  }

  private formatCart(customerId: string, cart: CartDTO) {
    return {
      status: 'success',
      customer_id: customerId,
      total_items: cart.itemsCount,
      subtotal_vnd: cart.subtotalVnd,
      total_vnd: cart.totalVnd,
      vat_vnd: cart.vatVnd,
      formatted_subtotal: cart.formattedTotal,
      items: cart.items.map((i) => ({
        sku: i.sku,
        name: i.name,
        quantity: i.quantity,
        unit_price_vnd: i.unitPriceVnd,
        formatted_unit_price: i.formattedUnitPrice,
        line_total_vnd: i.lineTotalVnd,
        formatted_line_total: i.formattedLineTotal,
        available_stock: i.availableStock,
        in_stock: i.inStock,
      })),
    };
  }

  /**
   * Tool 7: Thêm sản phẩm vào giỏ hàng (PostgreSQL SSOT)
   */
  async addToCart(
    customerId: string,
    args: { sku?: string; variant_id?: string; quantity?: number; store_id?: string },
    idempotencyKey?: string,
  ) {
    if (!customerId || customerId === 'guest_user') {
      throw new BadRequestException('Mã khách hàng là bắt buộc để thêm vào giỏ hàng.');
    }
    const targetSku = args.sku || args.variant_id;
    if (!targetSku) {
      throw new BadRequestException('Mã SKU hoặc variant_id là bắt buộc.');
    }
    const qty = args.quantity ?? 1;
    if (!Number.isSafeInteger(qty) || qty < 1) {
      throw new BadRequestException('Số lượng sản phẩm phải là số nguyên dương.');
    }
    if (!this.cartService) {
      throw new ServiceUnavailableException('Dịch vụ giỏ hàng hiện không khả dụng.');
    }
    if (!idempotencyKey) throw new BadRequestException('Cần Idempotency-Key để thêm vào giỏ hàng.');
    const result = await this.cartService.addItemIdempotent(customerId, { sku: targetSku, quantity: qty, storeId: args.store_id }, idempotencyKey);
    const cart = this.formatCart(customerId, result);

    return {
      status: 'success',
      message: `Đã thêm ${qty} sản phẩm [${targetSku}] vào giỏ hàng.`,
      cart,
    };
  }

  /**
   * Tool 8: Xóa sản phẩm khỏi giỏ hàng (PostgreSQL SSOT)
   */
  async removeFromCart(customerId: string, args: { sku?: string; variant_id?: string }, idempotencyKey?: string) {
    if (!customerId || customerId === 'guest_user') {
      throw new BadRequestException('Mã khách hàng là bắt buộc để xóa khỏi giỏ hàng.');
    }
    const targetSku = args.sku || args.variant_id;
    if (!targetSku) {
      throw new BadRequestException('Mã SKU hoặc variant_id là bắt buộc.');
    }
    if (!this.cartService) {
      throw new ServiceUnavailableException('Dịch vụ giỏ hàng hiện không khả dụng.');
    }
    if (!idempotencyKey) throw new BadRequestException('Cần Idempotency-Key để xóa khỏi giỏ hàng.');
    const result = await this.cartService.removeItemIdempotent(customerId, targetSku, undefined, idempotencyKey);
    const cart = this.formatCart(customerId, result);

    return {
      status: 'success',
      message: `Đã xóa sản phẩm ${targetSku} khỏi giỏ hàng.`,
      cart,
    };
  }

  /**
   * Tool 9: Tính toán xem trước đơn giá, chiết khấu và Signed Preview Token
   */
  async previewOrder(
    args: {
      sku?: string;
      variant_id?: string;
      quantity?: number;
      items?: Array<{ sku: string; quantity: number }>;
      discount_code?: string;
      store_id?: string;
    },
    customerId?: string,
  ) {
    let orderItems = args.items;
    if (!orderItems || !orderItems.length) {
      const targetSku = args.sku || args.variant_id;
      if (targetSku) {
        orderItems = [{ sku: targetSku, quantity: args.quantity || 1 }];
      } else if (customerId && customerId !== 'guest_user' && this.cartService) {
        const cart = await this.cartService.getCart(customerId, args.store_id);
        if (cart.items?.length) {
          orderItems = cart.items.map((i) => ({ sku: i.sku, quantity: i.quantity }));
        }
      }
    }

    if (!orderItems || !orderItems.length) {
      throw new BadRequestException('Danh sách mặt hàng hoặc mã SKU là bắt buộc để tính giá xem trước.');
    }

    const calculation = await this.ordersService.calculatePreview(
      orderItems,
      args.discount_code,
      args.store_id,
      customerId && customerId !== 'guest_user' ? customerId : undefined,
    );

    return {
      ...calculation,
      preview_token: calculation.previewToken,
      total_vnd: calculation.totalVnd,
      subtotal_vnd: calculation.subtotalVnd,
      discount_vnd: calculation.discountVnd,
      vat_vnd: calculation.vatVnd,
    };
  }

  /**
   * Tool 10: Tra cứu trạng thái đơn hàng (PostgreSQL SSOT & Anti-IDOR)
   */
  async getOrderStatus(args: { order_id?: string; order_no?: string }, requester?: { id: string; role: string }) {
    const targetId = args.order_id || args.order_no;
    if (!targetId) {
      throw new BadRequestException('Mã đơn hàng là bắt buộc.');
    }
    const requesterId = typeof requester?.id === 'string' ? requester.id.trim() : '';
    if (!requesterId || requesterId === 'guest_user' || !['CUSTOMER', 'ADMIN'].includes(requester?.role || '')) {
      throw new BadRequestException('Danh tính khách hàng là bắt buộc để tra cứu đơn hàng.');
    }
    const principal = { id: requesterId, role: requester!.role };

    const order = await this.ordersService.getOrder(targetId, principal);
    return {
      status: 'success',
      order_id: targetId,
      order_number: order.orderNo,
      order_status: order.status.toUpperCase(),
      total_vnd: order.totalVnd,
      formatted_total: order.formattedTotal,
      store_id: order.storeId,
      created_at: order.confirmedAt,
      items_count: order.itemsCount,
      items: order.items,
    };
  }

  /**
   * Tool 11: Hủy đơn hàng và hoàn trả tồn kho khả dụng (Anti-Oversell Release)
   */
  async cancelOrder(
    args: { order_id: string; reason?: string },
    requester?: { id: string; role: string },
    idempotencyKey?: string,
  ) {
    if (!args.order_id) {
      throw new BadRequestException('Mã đơn hàng là bắt buộc.');
    }
    const requesterId = typeof requester?.id === 'string' ? requester.id.trim() : '';
    if (!requesterId || requesterId === 'guest_user' || !['CUSTOMER', 'ADMIN'].includes(requester?.role || '')) {
      throw new BadRequestException('Danh tính khách hàng là bắt buộc để hủy đơn hàng.');
    }
    const principal = { id: requesterId, role: requester!.role };

    if (!idempotencyKey) throw new BadRequestException('Cần Idempotency-Key để hủy đơn hàng.');

    const reason = args.reason || 'Khách hàng yêu cầu hủy đơn qua tác tử AI';
    const result = await this.ordersService.cancelOrder(args.order_id, reason, principal, idempotencyKey);

    return {
      status: 'success',
      order_id: args.order_id,
      order_no: result.orderNo,
      action: 'CANCELLED',
      reason,
      inventory_restored: true,
      message: result.message,
    };
  }

  /**
   * Tool 12: Khởi tạo phiếu hỗ trợ / Khiếu nại bảo hành
   */
  async createSupportTicket(
    customerId: string,
    args: { order_id?: string; title: string; description: string },
    idempotencyKey?: string,
  ) {
    if (!customerId || customerId === 'guest_user') {
      throw new BadRequestException('Mã khách hàng là bắt buộc để tạo phiếu hỗ trợ.');
    }
    if (!args?.title?.trim() || !args?.description?.trim()) {
      throw new BadRequestException('Tiêu đề và nội dung khiếu nại là bắt buộc.');
    }
    if (!this.supportService) {
      throw new ServiceUnavailableException('Dịch vụ hỗ trợ khách hàng hiện không khả dụng.');
    }

    let phone: string | undefined;
    if (this.customersService) {
      try {
        const profile = await this.customersService.getProfile(customerId);
        phone = profile?.phone;
      } catch {
        // Customer profile phone lookup
      }
    }

    if (!idempotencyKey) {
      throw new BadRequestException('Cần Idempotency-Key để tạo phiếu hỗ trợ.');
    }
    const created = await this.supportService.createTicket(customerId, {
      orderId: args.order_id,
      title: args.title.trim(),
      description: args.description.trim(),
      confirmedProfilePhone: phone,
    }, idempotencyKey);

    return {
      status: 'success',
      ticket_id: created.ticketCode,
      message: `Phiếu hỗ trợ ${created.ticketCode} đã được tạo thành công và chuyển đến bộ phận CSKH MWG.`,
      ticket: created,
    };
  }

  /**
   * Tool 13: Quản lý danh sách sản phẩm yêu thích (Favorites)
   */
  async manageFavorite(
    customerId: string,
    args: { sku?: string; variant_id?: string; action?: 'add' | 'remove' | 'toggle' },
    idempotencyKey?: string,
  ) {
    if (!customerId || customerId === 'guest_user') {
      throw new BadRequestException('Mã khách hàng là bắt buộc để quản lý danh sách yêu thích.');
    }
    const targetSku = args.sku || args.variant_id;
    if (!targetSku) {
      throw new BadRequestException('Mã SKU hoặc variant_id là bắt buộc.');
    }
    const action = args.action || 'toggle';
    if (!['add', 'remove', 'toggle'].includes(action)) {
      throw new BadRequestException('Thao tác yêu thích không hợp lệ.');
    }

    if (!this.customersService) {
      throw new ServiceUnavailableException('Dịch vụ quản lý yêu thích hiện không khả dụng.');
    }
    if (!idempotencyKey) throw new BadRequestException('Cần Idempotency-Key để cập nhật yêu thích.');
    const product = await this.catalogService.getProductBySku(targetSku);
    if (!product?.id) {
      throw new ServiceUnavailableException('Không thể xác nhận sản phẩm yêu thích.');
    }
    const variantId = product.id;
    const toggled = await this.customersService.setFavoriteIdempotent(customerId, variantId, action, idempotencyKey);
    if (typeof toggled?.isFavorited !== 'boolean' ||
        (action !== 'toggle' && toggled.isFavorited !== (action === 'add'))) {
      throw new ServiceUnavailableException('Không thể xác nhận trạng thái yêu thích.');
    }
    return {
      status: 'success',
      customer_id: customerId,
      sku: targetSku,
      variant_id: variantId,
      action,
      is_favorited: toggled.isFavorited,
      message: toggled.isFavorited
        ? `Đã thêm sản phẩm [${targetSku}] vào danh sách yêu thích.`
        : `Đã xóa sản phẩm [${targetSku}] khỏi danh sách yêu thích.`,
    };
  }
}
