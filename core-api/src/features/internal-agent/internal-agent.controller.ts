import { Public } from '../../shared/decorators/public.decorator';
import {
  Controller,
  Post,
  Body,
  Req,
  Headers,
  UseGuards,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { InternalAgentService } from './internal-agent.service';
import { InternalSecretGuard } from '../../shared/guards/internal-secret.guard';
import { InternalUserGuard } from './internal-user.guard';

@Public()
@Controller('internal/tools')
@UseGuards(InternalSecretGuard)
export class InternalAgentController {
  constructor(private readonly agentService: InternalAgentService) {}

  private requester(request: any): { id: string; role: string } {
    const user = request?.internalUser;
    if (!user?.id || !['CUSTOMER', 'ADMIN'].includes(user.role)) {
      throw new BadRequestException('Cần danh tính người dùng đã xác thực.');
    }
    return user;
  }

  @Post('operation-status')
  @HttpCode(200)
  @UseGuards(InternalUserGuard)
  async operationStatus(@Req() request: any, @Headers('idempotency-key') key?: string) {
    return this.agentService.operationStatus(this.requester(request).id, key);
  }

  // 1. Tìm kiếm laptop
  @Post(['catalog-search', 'search_products'])
  async catalogSearch(@Body() body: any) {
    const res = await this.agentService.searchCatalog(body || {});
    return { status: 'success', tool: 'catalog_search', data: res };
  }

  // 2. Chi tiết sản phẩm
  @Post(['product-detail', 'get_product_details'])
  async productDetail(@Body() body: any) {
    const res = await this.agentService.getProductDetails(body || {});
    return { status: 'success', tool: 'get_product_details', data: res };
  }

  // 3. So sánh sản phẩm
  @Post(['compare-products', 'compare_products'])
  async compareProducts(@Body() body: any) {
    const res = await this.agentService.compareProducts(body || {});
    return { status: 'success', tool: 'compare_products', data: res };
  }

  // 4. Kiểm tra tồn kho
  @Post(['inventory-check', 'check_inventory'])
  async inventoryCheck(@Body() body: any) {
    const res = await this.agentService.checkInventory(body || {});
    return { status: 'success', tool: 'inventory_check', data: res };
  }

  // 5. Tra cứu chính sách bảo hành / đổi trả
  @Post(['policy-search', 'search_policy'])
  async policySearch(@Body() body: any) {
    const res = await this.agentService.searchPolicy(body || {});
    return { status: 'success', tool: 'search_policy', data: res };
  }

  // 6. Xem giỏ hàng (Chống IDOR qua Header X-Customer-Id)
  @Post(['cart-view', 'view_cart'])
  @UseGuards(InternalUserGuard)
  async cartView(
    @Req() request: any,
  ) {
    const customerId = this.requester(request).id;
    const res = await this.agentService.viewCart(customerId);
    return { status: 'success', tool: 'view_cart', data: res };
  }

  // 7. Thêm vào giỏ hàng
  @Post(['cart-add', 'add_to_cart'])
  @UseGuards(InternalUserGuard)
  async cartAdd(
    @Body() body: any,
    @Req() request: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const customerId = this.requester(request).id;
    const res = await this.agentService.addToCart(customerId, body || {}, idempotencyKey);
    return { status: 'success', tool: 'add_to_cart', data: res };
  }

  // 8. Xóa khỏi giỏ hàng
  @Post(['cart-remove', 'remove_from_cart'])
  @UseGuards(InternalUserGuard)
  async cartRemove(
    @Body() body: any,
    @Req() request: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const customerId = this.requester(request).id;
    const res = await this.agentService.removeFromCart(customerId, body || {}, idempotencyKey);
    return { status: 'success', tool: 'remove_from_cart', data: res };
  }

  // 9. Xem trước đơn hàng & Signed Preview Token
  @Post(['order-preview', 'preview_order'])
  @UseGuards(InternalUserGuard)
  async orderPreview(
    @Body() body: any,
    @Req() request: any,
  ) {
    const customerId = this.requester(request).id;
    const res = await this.agentService.previewOrder(body || {}, customerId);
    return { status: 'success', tool: 'order_preview', data: res };
  }

  // 10. Trạng thái đơn hàng
  @Post(['order-status', 'get_order_status', 'lookup_order'])
  @UseGuards(InternalUserGuard)
  async orderStatus(
    @Body() body: any,
    @Req() request: any,
  ) {
    const res = await this.agentService.getOrderStatus(body || {}, this.requester(request));
    return { status: 'success', tool: 'get_order_status', data: res };
  }

  // 11. Hủy đơn hàng giả lập
  @Post(['order-cancel', 'cancel_simulated_order'])
  @UseGuards(InternalUserGuard)
  async orderCancel(
    @Body() body: any,
    @Req() request: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const res = await this.agentService.cancelOrder(body || {}, this.requester(request), idempotencyKey);
    return { status: 'success', tool: 'cancel_simulated_order', data: res };
  }

  // 12. Tạo phiếu hỗ trợ CSKH
  @Post(['ticket-create', 'create_support_ticket'])
  @UseGuards(InternalUserGuard)
  async ticketCreate(
    @Body() body: any,
    @Req() request: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const customerId = this.requester(request).id;
    const res = await this.agentService.createSupportTicket(customerId, body || {}, idempotencyKey);
    return { status: 'success', tool: 'create_support_ticket', data: res };
  }

  // 13. Quản lý sản phẩm yêu thích (Favorites)
  @Post(['manage-favorite', 'manage_favorite'])
  @UseGuards(InternalUserGuard)
  async manageFavorite(
    @Body() body: any,
    @Req() request: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const customerId = this.requester(request).id;
    const res = await this.agentService.manageFavorite(customerId, body || {}, idempotencyKey);
    return { status: 'success', tool: 'manage_favorite', data: res };
  }
}
