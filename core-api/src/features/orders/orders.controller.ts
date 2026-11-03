import { CurrentUser, AuthenticatedUser } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Param,
  Query,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrdersService, OrderResultDTO, PreviewCalculationDTO } from './orders.service';
import { CheckoutDto, PreviewOrderDto } from './dto/checkout.dto';

@Roles('CUSTOMER', 'ADMIN')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('preview')
  async preview(
    @Body() dto: PreviewOrderDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<PreviewCalculationDTO> {
    return this.ordersService.calculatePreview(dto.items, dto.discountCode, dto.storeId, user?.id);
  }

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  async checkout(
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<OrderResultDTO> {
    const key = idempotencyKey || (dto as any).idempotencyKey;
    if (!key) {
      throw new BadRequestException('Bắt buộc cung cấp Header "Idempotency-Key" để chốt đơn.');
    }
    if (!user?.id) {
      throw new BadRequestException('Yêu cầu xác thực tài khoản để thực hiện chốt đơn.');
    }
    return this.ordersService.checkout({ ...dto, customerId: user.id }, key);
  }

  @Get()
  async getOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.ordersService.getOrders(user, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
    });
  }

  @Get(':id')
  async getOrder(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.getOrder(id, user);
  }

  @Post(':id/cancel')
  async cancelOrder(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.cancelOrder(id, reason, user);
  }

  @Post(':id/simulate-payment')
  async simulatePayment(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ) {
    if (!key) throw new BadRequestException('Bắt buộc cung cấp Idempotency-Key để thanh toán mô phỏng.');
    return this.ordersService.simulatePayment(id, user, key);
  }
}

@Roles('ADMIN')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async getOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.ordersService.getOrders(user, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
    });
  }

  @Get(':id')
  async getOrder(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.getOrder(id, user);
  }
}
