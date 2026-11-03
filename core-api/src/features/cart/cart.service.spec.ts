import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CartService } from './cart.service';
import { CatalogService, Variant } from '../catalog/public-api';
import { InventoryService } from '../inventory/public-api';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createMockDataSource, createMockVariantRepository } from '../../test/test-bed.helper';

describe('CartService (Persistent Cart & Stock Availability - UC04)', () => {
  let cartService: CartService;
  let inventoryService: InventoryService;
  let mockDataSource: any;

  const CUSTOMER_A = '00000000-0000-0000-0000-000000000002';
  const CUSTOMER_B = '00000000-0000-0000-0000-000000000099';
  const STORE_HCM = '10000000-0000-0000-0000-000000000001';
  const TARGET_SKU = 'LT-ASUS-VIVO15-OLED';

  it('requires an explicit store instead of assuming a fixture store UUID', async () => {
    await expect(cartService.addItem(CUSTOMER_A, { sku: TARGET_SKU, quantity: 1 }))
      .rejects.toThrow(BadRequestException);
  });

  beforeEach(async () => {
    mockDataSource = createMockDataSource();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        CatalogService,
        InventoryService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: getRepositoryToken(Variant),
          useValue: createMockVariantRepository(),
        },
        {
          provide: getRepositoryToken(Cart),
          useValue: mockDataSource.getRepository(Cart),
        },
        {
          provide: getRepositoryToken(CartItem),
          useValue: mockDataSource.getRepository(CartItem),
        },
      ],
    }).compile();

    cartService = module.get<CartService>(CartService);
    inventoryService = module.get<InventoryService>(InventoryService);
  });

  it('should initialize an empty active cart for a customer', async () => {
    const cart = await cartService.getCart(CUSTOMER_A, STORE_HCM);
    expect(cart.id).toBeDefined();
    expect(cart.customerId).toBe(CUSTOMER_A);
    expect(cart.items).toEqual([]);
    expect(cart.itemsCount).toBe(0);
    expect(cart.totalVnd).toBe('0');
  });

  it('should add a product to cart and calculate exact Decimal total', async () => {
    // Standard price: 17,990,000 * 2 = 35,980,000 + 10% VAT = 39,578,000
    const cart = await cartService.addItem(CUSTOMER_A, {
      sku: TARGET_SKU,
      quantity: 2,
      storeId: STORE_HCM,
    });

    expect(cart.items.length).toBe(1);
    expect(cart.items[0].sku).toBe(TARGET_SKU);
    expect(cart.items[0].quantity).toBe(2);
    expect(cart.items[0].unitPriceVnd).toBe('17990000');
    expect(cart.items[0].lineTotalVnd).toBe('35980000');
    expect(cart.subtotalVnd).toBe('35980000');
    expect(cart.vatVnd).toBe('3598000');
    expect(cart.totalVnd).toBe('39578000');
    expect(cart.items[0].inStock).toBe(true);
  });

  it('should reject adding item when stock is exhausted (ConflictException)', async () => {
    // Set stock: onHand = 0, reserved = 0
    mockDataSource.setStock(STORE_HCM, TARGET_SKU, 0, 0);

    await expect(
      cartService.addItem(CUSTOMER_A, {
        sku: TARGET_SKU,
        quantity: 1,
        storeId: STORE_HCM,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should reject adding item when requested quantity exceeds available stock', async () => {
    // Set stock: onHand = 3, reserved = 0 (available = 3)
    mockDataSource.setStock(STORE_HCM, TARGET_SKU, 3, 0);

    await expect(
      cartService.addItem(CUSTOMER_A, {
        sku: TARGET_SKU,
        quantity: 5,
        storeId: STORE_HCM,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should accumulate quantity when adding the same item multiple times', async () => {
    mockDataSource.setStock(STORE_HCM, TARGET_SKU, 10, 0);

    await cartService.addItem(CUSTOMER_A, { sku: TARGET_SKU, quantity: 2, storeId: STORE_HCM });
    const updated = await cartService.addItem(CUSTOMER_A, { sku: TARGET_SKU, quantity: 3, storeId: STORE_HCM });

    expect(updated.items.length).toBe(1);
    expect(updated.items[0].quantity).toBe(5);
    // 17,990,000 * 5 = 89,950,000
    expect(updated.subtotalVnd).toBe('89950000');
  });

  it('should reject updating quantity to 0 or negative (BadRequestException)', async () => {
    await cartService.addItem(CUSTOMER_A, { sku: TARGET_SKU, quantity: 1, storeId: STORE_HCM });

    await expect(
      cartService.updateItemQuantity(CUSTOMER_A, TARGET_SKU, 0, STORE_HCM),
    ).rejects.toThrow(BadRequestException);

    await expect(
      cartService.updateItemQuantity(CUSTOMER_A, TARGET_SKU, -2, STORE_HCM),
    ).rejects.toThrow(BadRequestException);
  });

  it('should update item quantity and check stock capacity', async () => {
    mockDataSource.setStock(STORE_HCM, TARGET_SKU, 5, 0);
    await cartService.addItem(CUSTOMER_A, { sku: TARGET_SKU, quantity: 1, storeId: STORE_HCM });

    const cart = await cartService.updateItemQuantity(CUSTOMER_A, TARGET_SKU, 4, STORE_HCM);
    expect(cart.items[0].quantity).toBe(4);

    // Exceeding 5 available items should fail
    await expect(
      cartService.updateItemQuantity(CUSTOMER_A, TARGET_SKU, 10, STORE_HCM),
    ).rejects.toThrow(ConflictException);
  });

  it('should remove item from cart by SKU', async () => {
    await cartService.addItem(CUSTOMER_A, { sku: TARGET_SKU, quantity: 1, storeId: STORE_HCM });

    const cart = await cartService.removeItem(CUSTOMER_A, TARGET_SKU, STORE_HCM);
    expect(cart.items.length).toBe(0);
    expect(cart.itemsCount).toBe(0);
  });

  it('should throw NotFoundException when removing a SKU not in cart', async () => {
    await expect(
      cartService.removeItem(CUSTOMER_A, 'LT-NON-EXISTENT', STORE_HCM),
    ).rejects.toThrow(NotFoundException);
  });

  it('should clear all items in active cart', async () => {
    mockDataSource.setStock(STORE_HCM, TARGET_SKU, 10, 0);
    await cartService.addItem(CUSTOMER_A, { sku: TARGET_SKU, quantity: 2, storeId: STORE_HCM });
    await cartService.addItem(CUSTOMER_A, { sku: 'LT-DELL-INSP14-5430', quantity: 1, storeId: STORE_HCM });

    let cart = await cartService.getCart(CUSTOMER_A, STORE_HCM);
    expect(cart.items.length).toBe(2);

    await cartService.clearCart(CUSTOMER_A);

    cart = await cartService.getCart(CUSTOMER_A, STORE_HCM);
    expect(cart.items.length).toBe(0);
    expect(cart.itemsCount).toBe(0);
  });

  it('should strictly isolate carts between different customers (Anti-IDOR)', async () => {
    mockDataSource.setStock(STORE_HCM, TARGET_SKU, 10, 0);

    // Customer A adds Asus laptop
    await cartService.addItem(CUSTOMER_A, { sku: TARGET_SKU, quantity: 1, storeId: STORE_HCM });

    // Customer B cart must still be empty
    const cartB = await cartService.getCart(CUSTOMER_B, STORE_HCM);
    expect(cartB.items.length).toBe(0);

    // Customer B adds Dell laptop
    await cartService.addItem(CUSTOMER_B, { sku: 'LT-DELL-INSP14-5430', quantity: 2, storeId: STORE_HCM });

    // Customer A cart must only contain Asus, Customer B only Dell
    const finalCartA = await cartService.getCart(CUSTOMER_A, STORE_HCM);
    expect(finalCartA.items.length).toBe(1);
    expect(finalCartA.items[0].sku).toBe(TARGET_SKU);

    const finalCartB = await cartService.getCart(CUSTOMER_B, STORE_HCM);
    expect(finalCartB.items.length).toBe(1);
    expect(finalCartB.items[0].sku).toBe('LT-DELL-INSP14-5430');
  });
});

