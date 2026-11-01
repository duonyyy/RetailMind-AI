import { Roles } from '../../shared/decorators/roles.decorator';
import { Public } from '../../shared/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../shared/decorators/current-user.decorator';
import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { InventoryService } from './services/inventory.service';

@Controller(['inventory', 'admin/inventory'])
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Public()
  @Get('stores')
  async getStores() {
    return this.inventoryService.getStores();
  }

  @Roles('ADMIN')
  @Get('matrix')
  async getInventoryMatrix() {
    return this.inventoryService.getInventoryMatrix();
  }

  @Public()
  @Get('stock')
  async getStock(
    @Query('storeId') storeId: string,
    @Query('variantId') variantId: string,
  ) {
    return this.inventoryService.getStock(storeId, variantId);
  }

  @Roles('ADMIN')
  @Post('reserve')
  async reserveStock(
    @Body('storeId') storeId: string,
    @Body('variantId') variantId: string,
    @Body('quantity') quantity: number,
  ) {
    await this.inventoryService.reserveStock(storeId, variantId, quantity);
    return {
      message: `Đã giữ chỗ thành công ${quantity} sản phẩm tại kho.`,
    };
  }

  @Roles('ADMIN')
  @Post('adjust')
  async adjustInventory(
    @Body('storeId') storeId: string,
    @Body('variantId') variantId: string,
    @Body('newOnHandQty') newOnHandQty: number,
    @Body('reason') reason: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const actorId = user ? `admin:${user.id}` : 'admin';
    return this.inventoryService.adjustInventory(
      storeId,
      variantId,
      newOnHandQty,
      reason,
      actorId,
    );
  }
}
