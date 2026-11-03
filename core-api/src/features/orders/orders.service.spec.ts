import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OrdersService } from './orders.service';
import { CatalogService, Variant } from '../catalog/public-api';
import { InventoryService } from '../inventory/public-api';
import { CartService } from '../cart/public-api';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { createMockDataSource, createMockVariantRepository } from '../../test/test-bed.helper';

describe('OrdersService (SSOT Commerce, ACID & Order Lifecycle)', () => {
  let ordersService: OrdersService;
  let catalogService: CatalogService;
  let inventoryService: InventoryService;
  let mockDataSource: any;
  let mockCartService: any;

  beforeEach(async () => {
    mockDataSource = createMockDataSource();
    mockCartService = {
      clearCart: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        CatalogService,
        InventoryService,
        {
          provide: CartService,
          useValue: mockCartService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: getRepositoryToken(Variant),
          useValue: createMockVariantRepository(),
        },
      ],
    }).compile();

    ordersService = module.get<OrdersService>(OrdersService);
    catalogService = module.get<CatalogService>(CatalogService);
    inventoryService = module.get<InventoryService>(InventoryService);
  });

  it('should calculate preview with exact Decimal precision and VAT', async () => {
    const items = [{ sku: 'LT-ASUS-VIVO15-OLED', quantity: 1 }];
    const preview = await ordersService.calculatePreview(items, undefined, 'store-hcm-q1', 'cust-test-01');

    expect(preview.subtotalVnd).toBe('17990000');
    // VAT 10% of 17,990,000 = 1,799,000
    expect(preview.vatVnd).toBe('1799000');
    // Total = 17,990,000 + 1,799,000 = 19,789,000
    expect(preview.totalVnd).toBe('19789000');
    expect(preview.items.length).toBe(1);
    expect(preview.items[0].name).toContain('Asus Vivobook');
    expect(preview.previewToken).toBeDefined();
    expect(preview.expiresAt).toBeDefined();
  });

  it('should apply discount code MWG_VIP500 correctly', async () => {
    const items = [{ sku: 'LT-ASUS-VIVO15-OLED', quantity: 1 }];
    const preview = await ordersService.calculatePreview(items, 'MWG_VIP500', 'store-hcm-q1', 'cust-test-01');

    expect(preview.discountVnd).toBe('500000');
    // Subtotal after discount = 17,990,000 - 500,000 = 17,490,000
    // VAT 10% = 1,749,000
    expect(preview.vatVnd).toBe('1749000');
    // Total = 17,490,000 + 1,749,000 = 19,239,000
    expect(preview.totalVnd).toBe('19239000');
  });

  it('should enforce idempotency protection and prevent double-order creation', async () => {
    const idempotencyKey = 'idem-key-test-999';
    const dto = {
      storeId: 'store-hcm-q1',
      customerId: 'cust-test-01',
      items: [{ sku: 'LT-ASUS-VIVO15-OLED', quantity: 1 }],
    };

    // First checkout call
    const order1 = await ordersService.checkout(dto, idempotencyKey);
    expect(order1.orderNo).toBeDefined();
    expect(order1.status).toBe('placed');
    expect(mockCartService.clearCart).not.toHaveBeenCalled(); // buy-now leaves unrelated cart items intact

    // Second checkout call with identical idempotencyKey
    const order2 = await ordersService.checkout(dto, idempotencyKey);
    // Must return the exact same order instance without duplicate booking
    expect(order2.orderId).toBe(order1.orderId);
    expect(order2.orderNo).toBe(order1.orderNo);
  });

  it('should reject idempotent request if payload is tampered (Anti-Tampering)', async () => {
    const idempotencyKey = 'idem-tamper-key-100';
    const dto1 = {
      storeId: 'store-hcm-q1',
      customerId: 'cust-tamper-01',
      items: [{ sku: 'LT-ASUS-VIVO15-OLED', quantity: 1 }],
    };

    const order1 = await ordersService.checkout(dto1, idempotencyKey);
    expect(order1.orderId).toBeDefined();

    // Tampered payload with same idempotency key (different quantity)
    const dto2 = {
      storeId: 'store-hcm-q1',
      customerId: 'cust-tamper-01',
      items: [{ sku: 'LT-ASUS-VIVO15-OLED', quantity: 2 }],
    };

    await expect(ordersService.checkout(dto2, idempotencyKey)).rejects.toThrow(ConflictException);
  });

  it('should validate Signed Preview Token during checkout', async () => {
    const items = [{ sku: 'LT-ASUS-VIVO15-OLED', quantity: 1 }];
    const preview = await ordersService.calculatePreview(items, undefined, 'store-hcm-q1', 'cust-token-01');

    // Valid checkout with preview token
    const order = await ordersService.checkout(
      {
        storeId: 'store-hcm-q1',
        customerId: 'cust-token-01',
        items,
        previewToken: preview.previewToken,
      },
      'idem-token-valid-01',
    );
    expect(order.orderId).toBeDefined();

    // Tampered token checkout should be rejected
    const tamperedToken = `${preview.previewToken}tampered`;
    await expect(
      ordersService.checkout(
        {
          storeId: 'store-hcm-q1',
          customerId: 'cust-token-01',
          items,
          previewToken: tamperedToken,
        },
        'idem-token-tamper-01',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should cancel confirmed order and prevent double cancellation', async () => {
    const order = await ordersService.checkout(
      {
        storeId: 'store-hcm-q1',
        customerId: 'cust-cancel-01',
        items: [{ sku: 'LT-ASUS-VIVO15-OLED', quantity: 1 }],
      },
      'idem-cancel-test-01',
    );

    const cancelRes = await ordersService.cancelOrder(order.orderId, 'Khách đổi ý', {
      id: 'cust-cancel-01',
      role: 'CUSTOMER',
    });
    expect(cancelRes.success).toBe(true);
    expect(cancelRes.status).toBe('CANCELLED');

    // Double cancel should throw ConflictException
    await expect(
      ordersService.cancelOrder(order.orderId, 'Hủy lần 2', {
        id: 'cust-cancel-01',
        role: 'CUSTOMER',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should enforce anti-IDOR when cancelling an order', async () => {
    const order = await ordersService.checkout(
      {
        storeId: 'store-hcm-q1',
        customerId: 'customer-alice',
        items: [{ sku: 'LT-ASUS-VIVO15-OLED', quantity: 1 }],
      },
      'idem-cancel-idor-01',
    );

    // Customer Bob tries to cancel Alice's order -> Forbidden
    await expect(
      ordersService.cancelOrder(order.orderId, 'Bob tries cancel', {
        id: 'customer-bob',
        role: 'CUSTOMER',
      }),
    ).rejects.toThrow(ForbiddenException);

    // Alice cancels her own order -> Success
    const cancelRes = await ordersService.cancelOrder(order.orderId, 'Alice cancels', {
      id: 'customer-alice',
      role: 'CUSTOMER',
    });
    expect(cancelRes.success).toBe(true);
  });

  it('should execute simulated payment and prevent re-payment or paying cancelled orders', async () => {
    const order = await ordersService.checkout(
      {
        storeId: 'store-hcm-q1',
        customerId: 'customer-charlie',
        items: [{ sku: 'LT-ASUS-VIVO15-OLED', quantity: 1 }],
      },
      'idem-pay-test-01',
    );

    // Another customer tries to pay Charlie's order -> Forbidden
    await expect(
      ordersService.simulatePayment(order.orderId, {
        id: 'customer-intruder',
        role: 'CUSTOMER',
      }),
    ).rejects.toThrow(ForbiddenException);

    // Charlie simulates payment -> Success
    const payRes = await ordersService.simulatePayment(order.orderId, {
      id: 'customer-charlie',
      role: 'CUSTOMER',
    });

    expect(payRes.status).toBe('completed');
    expect(payRes.paymentRef).toContain('SIM_PAY_');
    expect(payRes.paidAt).toBeDefined();

    // Paying already completed order -> ConflictException
    await expect(
      ordersService.simulatePayment(order.orderId, {
        id: 'customer-charlie',
        role: 'CUSTOMER',
      }),
    ).rejects.toThrow(ConflictException);

    // Cancelling completed order -> ConflictException
    await expect(
      ordersService.cancelOrder(order.orderId, 'Cannot cancel paid order', {
        id: 'customer-charlie',
        role: 'CUSTOMER',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should list customer order history with pagination and anti-IDOR isolation', async () => {
    // Create orders for User 1
    await ordersService.checkout(
      {
        storeId: 'store-hcm-q1',
        customerId: 'user-history-1',
        items: [{ sku: 'LT-ASUS-VIVO15-OLED', quantity: 1 }],
      },
      'idem-hist-1',
    );
    await ordersService.checkout(
      {
        storeId: 'store-hcm-q1',
        customerId: 'user-history-1',
        items: [{ sku: 'LT-ASUS-VIVO15-OLED', quantity: 1 }],
      },
      'idem-hist-2',
    );

    // Create order for User 2
    await ordersService.checkout(
      {
        storeId: 'store-hcm-q1',
        customerId: 'user-history-2',
        items: [{ sku: 'LT-ASUS-VIVO15-OLED', quantity: 1 }],
      },
      'idem-hist-3',
    );

    // User 1 queries their history
    const user1Orders = await ordersService.getOrders(
      { id: 'user-history-1', role: 'CUSTOMER' },
      { page: 1, limit: 10 },
    );
    expect(user1Orders.total).toBe(2);
    expect(user1Orders.orders.length).toBe(2);
    expect(user1Orders.orders.every((o) => o.customerId === 'user-history-1')).toBe(true);

    // User 2 queries their history
    const user2Orders = await ordersService.getOrders(
      { id: 'user-history-2', role: 'CUSTOMER' },
      { page: 1, limit: 10 },
    );
    expect(user2Orders.total).toBe(1);
    expect(user2Orders.orders[0].customerId === 'user-history-2').toBe(true);
  });
});
