import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import Decimal from 'decimal.js';
import { CatalogService } from '../catalog/public-api';
import { InventoryService } from '../inventory/public-api';
import { CartService } from '../cart/public-api';
import { AuditService } from '../audit/public-api';
import { PreviewTokenHelper } from './helpers/preview-token.helper';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { randomUUID, createHash } from 'crypto';
import { transactionalIdempotency } from '../../shared/idempotency/transactional-idempotency';

export interface OrderItemInput {
  sku: string;
  quantity: number;
}

export interface PreviewCalculationDTO {
  items: {
    sku: string;
    name: string;
    unitPriceVnd: string;
    quantity: number;
    lineTotalVnd: string;
  }[];
  subtotalVnd: string;
  discountVnd: string;
  vatVnd: string;
  totalVnd: string;
  formattedTotal: string;
  appliedDiscountNote?: string;
  previewToken?: string;
  expiresAt?: string;
}

export interface CheckoutInputDTO {
  fromCart?: boolean;
  storeId: string;
  customerId?: string;
  items: OrderItemInput[];
  discountCode?: string;
  paymentMethod?: string;
  previewToken?: string;
}

export interface OrderResultDTO {
  storeName?: string;
  orderId: string;
  orderNo: string;
  status: string;
  storeId: string;
  customerId: string;
  totalVnd: string;
  formattedTotal: string;
  itemsCount: number;
  confirmedAt: string;
  idempotencyKey: string;
  items?: {
    sku: string;
    name?: string;
    unitPriceVnd?: string;
    quantity: number;
    lineTotalVnd?: string;
  }[];
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly inventoryService: InventoryService,
    @Optional() private readonly dataSource?: DataSource,
    @Optional() private readonly cartService?: CartService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  private db(): DataSource {
    if (!this.dataSource?.isInitialized) throw new ServiceUnavailableException('Không thể xác nhận dữ liệu giao dịch lúc này.');
    return this.dataSource;
  }

  async calculatePreview(
    items: OrderItemInput[],
    discountCode?: string,
    storeId?: string,
    customerId?: string,
    manager?: EntityManager,
  ): Promise<PreviewCalculationDTO> {
    const dbManager = manager || this.db().manager;
    if (!storeId || !storeId.trim()) {
      throw new BadRequestException('Mã chi nhánh siêu thị (storeId) là bắt buộc để tính giá xem trước.');
    }
    const store = await this.inventoryService.resolveStore(dbManager, storeId.trim());
    const validCustomerId = customerId?.trim() || 'guest_preview';
    if (!Array.isArray(items) || !items.length) throw new BadRequestException('Giỏ hàng không được rỗng.');
    let subtotal = new Decimal(0);
    const calculatedItems: PreviewCalculationDTO['items'] = [];
    for (const item of items) {
      if (!item || !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
        throw new BadRequestException('Số lượng phải là số nguyên dương.');
      }
      const product = await this.inventoryService.resolveVariant(dbManager, item.sku);
      const unitPrice = new Decimal(product.price_vnd);
      const total = unitPrice.times(item.quantity);
      subtotal = subtotal.plus(total);
      calculatedItems.push({
        sku: product.sku,
        name: product.name,
        unitPriceVnd: unitPrice.toString(),
        quantity: item.quantity,
        lineTotalVnd: total.toString(),
      });
    }
    let discount = new Decimal(0);
    let discountNote = 'Không áp dụng';
    if (discountCode) {
      const code = discountCode.trim().toUpperCase();
      if (code === 'MWG_VIP500' || code === 'BACK2SCHOOL') {
        discount = new Decimal(500000);
        discountNote = 'Mã ưu đãi (-500.000 ₫)';
      } else if (code === 'RETAILMIND10') {
        discount = subtotal.times(0.10).floor();
        discountNote = 'Mã ưu đãi (-10%)';
      }
    }
    const discounted = Decimal.max(0, subtotal.minus(discount));
    const vat = discounted.times(0.10).floor();
    const total = discounted.plus(vat);
    const { token, expiresAt } = PreviewTokenHelper.sign({
      customerId: validCustomerId,
      storeId: store.id,
      items: calculatedItems.map((it) => ({ sku: it.sku, quantity: it.quantity })),
      subtotalVnd: subtotal.toString(),
      discountVnd: discount.toString(),
      vatVnd: vat.toString(),
      totalVnd: total.toString(),
    });
    return {
      items: calculatedItems,
      subtotalVnd: subtotal.toString(),
      discountVnd: discount.toString(),
      vatVnd: vat.toString(),
      totalVnd: total.toString(),
      formattedTotal: `${new Intl.NumberFormat('vi-VN').format(BigInt(total.toFixed(0)))} ₫`,
      appliedDiscountNote: discountNote,
      previewToken: token,
      expiresAt,
    };
  }

  async checkout(dto: CheckoutInputDTO, idempotencyKey: string): Promise<OrderResultDTO> {
    const db = this.db();
    if (!idempotencyKey) throw new BadRequestException('Cần cung cấp Idempotency-Key.');
    if (!dto?.customerId || !dto.customerId.trim()) {
      throw new BadRequestException('Danh tính khách hàng (customerId) là bắt buộc để chốt đơn.');
    }
    if (!dto?.storeId || !dto.storeId.trim()) {
      throw new BadRequestException('Mã chi nhánh siêu thị (storeId) là bắt buộc để chốt đơn.');
    }
    const customerId = dto.customerId.trim();
    const scopedKey = `${customerId}:${idempotencyKey}`;

    // 1. Calculate tamper-detection request hash
    const normalizedItems = (dto.items || [])
      .map((it) => ({ sku: it.sku, quantity: it.quantity }))
      .sort((a, b) => a.sku.localeCompare(b.sku));
    const requestHashPayload = JSON.stringify({
      storeId: dto.storeId,
      customerId,
      items: normalizedItems,
      discountCode: (dto.discountCode || '').trim().toUpperCase(),
      fromCart: dto.fromCart === true,
      paymentMethod: dto.paymentMethod || 'COD',
    });
    const requestHash = createHash('sha256').update(requestHashPayload).digest('hex');

    // 2. Check existing Idempotency Key (Tamper Detection, In-Progress check & Replay Protection)
    const existing = await db.getRepository(IdempotencyKey).findOne({ where: { key: scopedKey } });
    if (existing) {
      if (existing.status === 'processing') {
        throw new ConflictException('Idempotency in progress: Giao dịch đang được xử lý, vui lòng không gửi trùng lặp.');
      }
      if (existing.responsePayload) {
        if (existing.responsePayload._requestHash && existing.responsePayload._requestHash !== requestHash) {
          throw new ConflictException('Idempotency payload mismatch: Yêu cầu không khớp với khóa idempotent đã dùng.');
        }
        return existing.responsePayload as OrderResultDTO;
      }
    }

    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      try {
        const idem = await runner.manager.save(
          runner.manager.create(IdempotencyKey, {
            key: scopedKey,
            status: 'processing',
            expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
          }),
        );

        const store = await this.inventoryService.resolveStore(runner.manager, dto.storeId);
        const preview = await this.calculatePreview(dto.items, dto.discountCode, store.id, customerId, runner.manager);
        if (dto.previewToken) {
          const verified = PreviewTokenHelper.verify(dto.previewToken);
          const previewItems = preview.items.map((it) => ({ sku: it.sku, quantity: it.quantity }));
          if (
            verified.storeId !== store.id ||
            verified.customerId !== customerId ||
            JSON.stringify(verified.items) !== JSON.stringify(previewItems) ||
            verified.totalVnd !== preview.totalVnd
          ) {
            throw new ConflictException('Bản xem trước không còn khớp. Vui lòng xác nhận lại.');
          }
        }
        if (dto.fromCart) {
          if (!this.cartService) throw new ServiceUnavailableException('Dịch vụ giỏ hàng hiện không khả dụng.');
          await this.cartService.consumeCheckoutCart(customerId, preview.items, runner.manager);
        }
        await this.inventoryService.reserveMultipleWithLock(
          runner,
          store.id,
          preview.items.map((it) => ({ variantId: it.sku, quantity: it.quantity })),
        );
        const orderNo = `MWG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
        const order = await runner.manager.save(
          runner.manager.create(Order, {
            order_no: orderNo,
            customer_id: customerId,
            store_id: store.id,
            idempotency_key_id: idem.id,
            status: 'placed',
            total_vnd: new Decimal(preview.totalVnd),
            confirmed_at: new Date(),
          }),
        );
        for (const item of preview.items) {
          const variant = await this.inventoryService.resolveVariant(runner.manager, item.sku);
          await runner.manager.save(
            runner.manager.create(OrderItem, {
              order_id: order.id,
              variant_id: variant.id,
              sku_snapshot: item.sku,
              title_snapshot: item.name,
              unit_price_vnd: new Decimal(item.unitPriceVnd),
              quantity: item.quantity,
              line_total_vnd: new Decimal(item.lineTotalVnd),
            }),
          );
        }
        const result: OrderResultDTO = {
          orderId: order.id,
          orderNo,
          status: 'placed',
          storeId: store.id,
          customerId,
          storeName: store.name,
          totalVnd: preview.totalVnd,
          formattedTotal: preview.formattedTotal,
          itemsCount: preview.items.length,
          confirmedAt: (order.confirmed_at || new Date()).toISOString(),
          idempotencyKey,
          items: preview.items,
        };
        idem.status = 'completed';
        idem.targetId = order.id;
        idem.responsePayload = { ...result, _requestHash: requestHash };
        await runner.manager.save(idem);

        if (this.auditService) {
          await this.auditService.logEvent(
            {
              actorId: customerId,
              action: 'ORDER_PLACED',
              entityType: 'Order',
              entityId: order.id,
              payload: {
                orderNo,
                storeId: store.id,
                totalVnd: preview.totalVnd,
                itemsCount: preview.items.length,
              },
            },
            runner.manager,
          );
        }

        await runner.commitTransaction();

        return result;
      } catch (innerError) {
        await runner.rollbackTransaction();
        // Rolling back already removes this transaction's receipt. Deleting
        // by key here could erase a concurrent request's committed receipt.
        if ((innerError as any)?.code === '23505') throw new ConflictException('Yêu cầu đang được xử lý. Hãy thử lại với cùng Idempotency-Key.');
        throw innerError;
      }
    } finally {
      await runner.release();
    }
  }

  async getOrders(
    principal: { id: string; role: string },
    options: { page?: number; limit?: number; status?: string } = {},
  ): Promise<{
    orders: OrderResultDTO[];
    total: number;
    page: number;
    limit: number;
  }> {
    if (!principal?.id) {
      throw new UnauthorizedException('Danh tính người dùng là bắt buộc để xem danh sách đơn hàng.');
    }
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    const offset = (page - 1) * limit;

    const db = this.db();
    const isAdmin = principal?.role === 'ADMIN';
    const customerId = principal?.id;

    let countSql = `SELECT COUNT(*) as count FROM orders WHERE ($1 = true OR customer_id::text = $2)`;
    let selectSql = `SELECT * FROM orders WHERE ($1 = true OR customer_id::text = $2)`;
    const params: any[] = [isAdmin, customerId];

    if (options.status) {
      params.push(options.status);
      countSql += ` AND status = $${params.length}`;
      selectSql += ` AND status = $${params.length}`;
    }

    selectSql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const countRes = await db.manager.query(countSql, params.slice(0, options.status ? 3 : 2));
    const total = parseInt(countRes[0]?.count || '0', 10);

    const rows = await db.manager.query(selectSql, params);
    const orderResults: OrderResultDTO[] = [];

    for (const order of rows) {
      const items = await db.getRepository(OrderItem).find({ where: { order_id: order.id } });
      const totalNum = BigInt(order.total_vnd ? String(order.total_vnd) : '0');
      orderResults.push({
        orderId: order.id,
        orderNo: order.order_no,
        status: order.status,
        storeId: order.store_id,
        customerId: order.customer_id,
        totalVnd: String(order.total_vnd),
        formattedTotal: `${new Intl.NumberFormat('vi-VN').format(totalNum)} ₫`,
        itemsCount: items.length,
        confirmedAt: new Date(order.confirmed_at || order.created_at || Date.now()).toISOString(),
        idempotencyKey: '',
        items: items.map((it) => ({
          sku: it.sku_snapshot,
          name: it.title_snapshot,
          unitPriceVnd: it.unit_price_vnd ? it.unit_price_vnd.toString() : '0',
          quantity: it.quantity,
          lineTotalVnd: it.line_total_vnd ? it.line_total_vnd.toString() : '0',
        })),
      });
    }

    return {
      orders: orderResults,
      total,
      page,
      limit,
    };
  }

  async getOrder(
    orderIdOrNo: string,
    principal: { id: string; role: string },
  ): Promise<OrderResultDTO> {
    if (!principal?.id) {
      throw new UnauthorizedException('Danh tính người dùng là bắt buộc để tra cứu đơn hàng.');
    }
    const db = this.db();
    const rows = await db.manager.query(
      'SELECT orders.*, (SELECT name FROM stores s WHERE s.id = orders.store_id) AS store_name FROM orders WHERE (id::text = $1 OR order_no = $1) AND ($2 = true OR customer_id::text = $3)',
      [orderIdOrNo, principal.role === 'ADMIN', principal.id],
    );
    if (!rows.length) throw new NotFoundException('Không tìm thấy đơn hàng.');
    const order = rows[0];
    const items = await db.getRepository(OrderItem).find({ where: { order_id: order.id } });
    const totalNum = BigInt(order.total_vnd ? String(order.total_vnd) : '0');
    return {
      orderId: order.id,
      orderNo: order.order_no,
      status: order.status,
      storeName: order.store_name,
      storeId: order.store_id,
      customerId: order.customer_id,
      totalVnd: String(order.total_vnd),
      formattedTotal: `${new Intl.NumberFormat('vi-VN').format(totalNum)} ₫`,
      itemsCount: items.length,
      confirmedAt: new Date(order.confirmed_at || Date.now()).toISOString(),
      idempotencyKey: '',
      items: items.map((it) => ({
        sku: it.sku_snapshot,
        name: it.title_snapshot,
        unitPriceVnd: it.unit_price_vnd.toString(),
        quantity: it.quantity,
        lineTotalVnd: it.line_total_vnd.toString(),
      })),
    };
  }

  async cancelOrder(
    orderIdOrNo: string,
    reason = 'Khách hàng yêu cầu hủy đơn',
    principal?: { id: string; role: string },
    idempotencyKey?: string,
  ): Promise<{ success: boolean; orderId: string; orderNo: string; status: string; message: string }> {
    if (!principal?.id) {
      throw new UnauthorizedException('Danh tính người dùng là bắt buộc để hủy đơn hàng.');
    }
    const runner = this.db().createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      try {
        const order = await runner.manager
          .createQueryBuilder(Order, 'ord')
          .setLock('pessimistic_write')
          .where('ord.id::text = :id OR ord.order_no = :id', { id: orderIdOrNo })
          .getOne();
        if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');

        if (principal && principal.role !== 'ADMIN' && order.customer_id !== principal.id) {
          throw new ForbiddenException('Không có quyền hủy đơn hàng của người khác.');
        }

        const cancel = async () => {
        if (order.status === 'cancelled') throw new ConflictException('Đơn hàng đã bị hủy.');
        if (order.status === 'completed') throw new ConflictException('Không thể hủy đơn hàng đã hoàn tất/thanh toán.');

        const items = await runner.manager.find(OrderItem, { where: { order_id: order.id } });
        if (!items.length) throw new ConflictException('Không thể xác nhận các sản phẩm cần hoàn kho.');

        await this.inventoryService.restoreStockInTx(
          runner,
          order.store_id,
          items.map((it) => ({ variantId: it.variant_id, quantity: it.quantity })),
        );

        order.status = 'cancelled';
        order.cancelled_at = new Date();
        await runner.manager.save(order);

        if (this.auditService) {
          await this.auditService.logEvent(
            {
              actorId: principal.id,
              action: 'ORDER_CANCEL',
              entityType: 'Order',
              entityId: order.id,
              payload: {
                orderNo: order.order_no,
                reason,
              },
            },
            runner.manager,
          );
        }

        return {
          success: true,
          orderId: order.id,
          orderNo: order.order_no,
          status: 'CANCELLED',
          message: `Đơn hàng ${order.order_no} đã được hủy. Lý do: ${reason}.`,
        };
        };
        const result = idempotencyKey !== undefined
          ? await transactionalIdempotency(runner.manager, principal.id, 'cancel_simulated_order', idempotencyKey,
              { orderIdOrNo, reason }, cancel)
          : await cancel();
        await runner.commitTransaction();
        return result;
      } catch (error) {
        await runner.rollbackTransaction();
        throw error;
      }
    } finally {
      await runner.release();
    }
  }

  async simulatePayment(
    orderIdOrNo: string,
    principal?: { id: string; role: string },
    idempotencyKey?: string,
  ): Promise<{
    orderId: string;
    orderNo: string;
    status: string;
    paymentRef: string;
    paidAt: string;
    totalVnd: string;
    formattedTotal: string;
  }> {
    if (!principal?.id) {
      throw new UnauthorizedException('Danh tính người dùng là bắt buộc để thanh toán đơn hàng.');
    }
    const runner = this.db().createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      try {
        const order = await runner.manager
          .createQueryBuilder(Order, 'ord')
          .setLock('pessimistic_write')
          .where('ord.id::text = :id OR ord.order_no = :id', { id: orderIdOrNo })
          .getOne();
        if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');

        if (principal && principal.role !== 'ADMIN' && order.customer_id !== principal.id) {
          throw new ForbiddenException('Không có quyền thanh toán đơn hàng của người khác.');
        }

        const pay = async () => {
        if (order.status === 'cancelled') {
          throw new ConflictException('Không thể thanh toán đơn hàng đã bị hủy.');
        }
        if (order.status === 'completed') {
          throw new ConflictException('Đơn hàng đã được thanh toán trước đó.');
        }

        const items = await runner.manager.find(OrderItem, { where: { order_id: order.id } });
        if (items.length) {
          await this.inventoryService.commitStockInTx(
            runner,
            order.store_id,
            items.map((it) => ({ variantId: it.variant_id, quantity: it.quantity })),
          );
        }

        order.status = 'completed';
        order.updated_at = new Date();
        await runner.manager.save(order);

        const paymentRef = `SIM_PAY_${order.order_no}`;

        if (this.auditService) {
          await this.auditService.logEvent(
            {
              actorId: principal.id,
              action: 'ORDER_PAYMENT',
              entityType: 'Order',
              entityId: order.id,
              payload: {
                orderNo: order.order_no,
                paymentRef,
                totalVnd: String(order.total_vnd),
              },
            },
            runner.manager,
          );
        }

        const totalNum = BigInt(order.total_vnd ? order.total_vnd.toString() : '0');

        return {
          orderId: order.id,
          orderNo: order.order_no,
          status: 'completed',
          paymentRef,
          paidAt: (order.updated_at || new Date()).toISOString(),
          totalVnd: String(order.total_vnd),
          formattedTotal: `${new Intl.NumberFormat('vi-VN').format(totalNum)} ₫`,
        };
        };
        const result = idempotencyKey !== undefined
          ? await transactionalIdempotency(runner.manager, principal.id, 'simulate_payment', idempotencyKey, { orderId: order.id }, pay)
          : await pay();
        await runner.commitTransaction();
        return result;
      } catch (error) {
        await runner.rollbackTransaction();
        throw error;
      }
    } finally {
      await runner.release();
    }
  }
}
