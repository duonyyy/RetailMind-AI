import { DataSource, EntityManager, QueryRunner, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { Variant } from '../features/catalog/entities/variant.entity';
import { Inventory } from '../features/inventory/entities/inventory.entity';
import { Order } from '../features/orders/entities/order.entity';
import { OrderItem } from '../features/orders/entities/order-item.entity';
import { IdempotencyKey } from '../features/orders/entities/idempotency-key.entity';
import { Cart, CartItem } from '../features/cart/public-api';

// --- Baseline Fixture Data conforming to RetailMind AI / MWG seed standards ---

export interface MockStoreRecord {
  id: string;
  code: string;
  name: string;
  address: string;
  display_address?: string;
  phone: string;
  phone_number?: string;
  is_active: boolean;
}

export const MOCK_STORES: MockStoreRecord[] = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    code: 'MWG_HCM_001',
    name: 'Thế Giới Di Động 136 Nguyễn Thái Học, Quận 1, TP.HCM',
    address: '136 Nguyễn Thái Học, P. Phạm Ngũ Lão, Quận 1, TP. Hồ Chí Minh',
    display_address: '136 Nguyễn Thái Học, P. Phạm Ngũ Lão, Quận 1, TP. Hồ Chí Minh',
    phone: '1800 1060',
    phone_number: '1800 1060',
    is_active: true,
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    code: 'MWG_HN_002',
    name: 'Thế Giới Di Động 117 Thái Hà, Đống Đa, Hà Nội',
    address: '117 Thái Hà, P. Trung Liệt, Q. Đống Đa, TP. Hà Nội',
    display_address: '117 Thái Hà, P. Trung Liệt, Q. Đống Đa, TP. Hà Nội',
    phone: '1800 1060',
    phone_number: '1800 1060',
    is_active: true,
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    code: 'MWG_DN_003',
    name: 'Điện Máy Xanh 320 đường 2 Tháng 9, Hải Châu, Đà Nẵng',
    address: '320 đường 2 Tháng 9, P. Hòa Cường Bắc, Q. Hải Châu, TP. Đà Nẵng',
    display_address: '320 đường 2 Tháng 9, P. Hòa Cường Bắc, Q. Hải Châu, TP. Đà Nẵng',
    phone: '1800 1061',
    phone_number: '1800 1061',
    is_active: true,
  },
];

export function createMockVariant(props: Partial<Variant>): Variant {
  const v = new Variant();
  Object.assign(v, props);
  return v;
}

export const MOCK_VARIANTS: Variant[] = [
  createMockVariant({
    id: '50000000-0000-0000-0000-000000000001',
    product_id: '40000000-0000-0000-0000-000000000001',
    sku: 'LT-ASUS-VIVO15-OLED',
    name: 'Laptop Asus Vivobook 15 OLED A1505VA',
    price_vnd: new Decimal('17990000'),
    ram_gb: 16,
    storage_gb: 512,
    cpu_model: 'Intel Core i5-13500H (12 nhân, 16 luồng)',
    gpu_model: 'Intel Iris Xe Graphics',
    is_active: true,
  }),
  createMockVariant({
    id: '50000000-0000-0000-0000-000000000002',
    product_id: '40000000-0000-0000-0000-000000000002',
    sku: 'LT-DELL-INSP14-5430',
    name: 'Laptop Dell Inspiron 14 5430',
    price_vnd: new Decimal('18490000'),
    ram_gb: 16,
    storage_gb: 512,
    cpu_model: 'Intel Core i5-1335U (10 nhân, 12 luồng)',
    gpu_model: 'Intel Iris Xe Graphics',
    is_active: true,
  }),
  createMockVariant({
    id: '50000000-0000-0000-0000-000000000003',
    product_id: '40000000-0000-0000-0000-000000000003',
    sku: 'LT-LENOVO-TB14-G6',
    name: 'Laptop Lenovo ThinkBook 14 G6+ (2024)',
    price_vnd: new Decimal('19990000'),
    ram_gb: 16,
    storage_gb: 512,
    cpu_model: 'Intel Core Ultra 5 125H (AI NPU tích hợp)',
    gpu_model: 'Intel Arc Graphics',
    is_active: true,
  }),
  createMockVariant({
    id: '50000000-0000-0000-0000-000000000004',
    product_id: '40000000-0000-0000-0000-000000000004',
    sku: 'LT-ACER-SWIFT-GO14',
    name: 'Laptop Acer Swift Go 14 OLED SFG14',
    price_vnd: new Decimal('16990000'),
    ram_gb: 16,
    storage_gb: 512,
    cpu_model: 'Intel Core i5-13500H',
    gpu_model: 'Intel Iris Xe',
    is_active: true,
  }),
  createMockVariant({
    id: '50000000-0000-0000-0000-000000000005',
    product_id: '40000000-0000-0000-0000-000000000005',
    sku: 'LT-HP-PAV14-DV2075TU',
    name: 'Laptop HP Pavilion 14-dv2075TU',
    price_vnd: new Decimal('15490000'),
    ram_gb: 16,
    storage_gb: 512,
    cpu_model: 'Intel Core i5-1235U',
    gpu_model: 'Intel Iris Xe',
    is_active: true,
  }),
  createMockVariant({
    id: '50000000-0000-0000-0000-000000000006',
    product_id: '40000000-0000-0000-0000-000000000006',
    sku: 'LT-APPLE-MBA-M2-8GB',
    name: 'MacBook Air 13.6 inch M2 (2022)',
    price_vnd: new Decimal('24990000'),
    ram_gb: 8,
    storage_gb: 256,
    cpu_model: 'Apple M2 (8 CPU, 8 GPU)',
    gpu_model: 'Apple M2 8-core GPU',
    is_active: true,
  }),
];

// --- Async Mutex for Pessimistic Row Locking ---
export class AsyncRowMutex {
  private static locks: Map<string, Array<() => void>> = new Map();
  private static active: Set<string> = new Set();

  static async acquire(key: string): Promise<() => void> {
    if (!this.active.has(key)) {
      this.active.add(key);
      return () => this.release(key);
    }
    return new Promise<() => void>((resolve) => {
      if (!this.locks.has(key)) {
        this.locks.set(key, []);
      }
      this.locks.get(key)!.push(() => {
        this.active.add(key);
        resolve(() => this.release(key));
      });
    });
  }

  static release(key: string): void {
    const queue = this.locks.get(key);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      next();
    } else {
      this.active.delete(key);
    }
  }

  static reset(): void {
    this.locks.clear();
    this.active.clear();
  }
}

// --- QueryBuilder Mock for Variant / Catalog Filtering ---
export function createMockVariantQueryBuilder(variants: Variant[] = MOCK_VARIANTS) {
  let list = [...variants];
  const qb: any = {
    where: jest.fn().mockImplementation((clause: string, params: any) => {
      if (params && params.active !== undefined) {
        list = list.filter((v) => v.is_active === params.active);
      }
      return qb;
    }),
    andWhere: jest.fn().mockImplementation((clause: string, params: any) => {
      if (!params) return qb;
      if (params.q) {
        const query = String(params.q).replace(/%/g, '').toLowerCase();
        list = list.filter(
          (v) =>
            v.name.toLowerCase().includes(query) ||
            v.sku.toLowerCase().includes(query) ||
            (v.cpu_model && v.cpu_model.toLowerCase().includes(query)),
        );
      }
      if (params.minRam) {
        list = list.filter((v) => v.ram_gb >= params.minRam);
      }
      if (params.minPrice) {
        list = list.filter((v) => new Decimal(v.price_vnd).gte(new Decimal(params.minPrice)));
      }
      if (params.maxPrice) {
        list = list.filter((v) => new Decimal(v.price_vnd).lte(new Decimal(params.maxPrice)));
      }
      if (params.sku) {
        list = list.filter((v) => v.sku === params.sku || v.id === params.sku);
      }
      return qb;
    }),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockImplementation(() => {
      list.sort((a, b) => new Decimal(a.price_vnd).minus(new Decimal(b.price_vnd)).toNumber());
      return qb;
    }),
    getMany: jest.fn().mockImplementation(async () => [...list]),
    getOne: jest.fn().mockImplementation(async () => (list.length > 0 ? list[0] : null)),
    getRawAndEntities: jest.fn().mockImplementation(async () => ({
      entities: [...list],
      raw: list.map((v) => ({
        product_name: v.name,
        product_slug: v.sku.toLowerCase(),
        brand_name: 'Asus',
        category_name: 'Laptop Học tập - Văn phòng',
      })),
    })),
  };
  return qb;
}

export function createMockVariantRepository(variants: Variant[] = MOCK_VARIANTS): Partial<Repository<Variant>> {
  return {
    createQueryBuilder: jest.fn().mockImplementation(() => createMockVariantQueryBuilder(variants)),
    find: jest.fn().mockImplementation(async () => [...variants]),
    findOne: jest.fn().mockImplementation(async (options: any) => {
      if (options?.where?.sku) {
        return variants.find((v) => v.sku === options.where.sku) || null;
      }
      if (options?.where?.id) {
        return variants.find((v) => v.id === options.where.id) || null;
      }
      return variants[0] || null;
    }),
  };
}

// --- Mock DataSource and In-Memory ACID Store ---
export interface MockDbOptions {
  initialStock?: Map<string, { onHand: number; reserved: number }>;
  stores?: MockStoreRecord[];
  variants?: Variant[];
}

export function createMockDataSource(options: MockDbOptions = {}) {
  const stores = options.stores || MOCK_STORES;
  const variants = options.variants || MOCK_VARIANTS;

  // In-memory tables
  const stockMap = options.initialStock || new Map<string, { onHand: number; reserved: number }>();
  // Populate standard inventory baseline
  for (const store of stores) {
    for (const v of variants) {
      const key = `${store.id}:${v.id}`;
      if (!stockMap.has(key)) {
        stockMap.set(key, { onHand: 10, reserved: 0 });
      }
    }
  }

  const ordersStore = new Map<string, Order>();
  const orderItemsStore: OrderItem[] = [];
  const idempotencyStore = new Map<string, IdempotencyKey>();
  const cartsStore = new Map<string, Cart>();
  const cartItemsStore = new Map<string, CartItem>();

  function resolveStoreRef(ref: string): MockStoreRecord | undefined {
    const cleanRef = ref.trim().toLowerCase();
    return stores.find(
      (s) =>
        s.id.toLowerCase() === cleanRef ||
        s.code.toLowerCase() === cleanRef ||
        (cleanRef.includes('hcm') && s.code.includes('HCM')) ||
        (cleanRef.includes('hn') && s.code.includes('HN')) ||
        (cleanRef.includes('dn') && s.code.includes('DN')),
    );
  }

  function resolveVariantRef(ref: string): Variant | undefined {
    const cleanRef = ref.trim().toLowerCase();
    return variants.find(
      (v) =>
        v.id.toLowerCase() === cleanRef ||
        v.sku.toLowerCase() === cleanRef ||
        (cleanRef.includes('asus') && v.sku.includes('ASUS')) ||
        (cleanRef.includes('dell') && v.sku.includes('DELL')) ||
        (cleanRef.includes('lenovo') && v.sku.includes('LENOVO')),
    );
  }

  function getStockRecord(storeId: string, variantId: string) {
    const key = `${storeId}:${variantId}`;
    if (!stockMap.has(key)) {
      stockMap.set(key, { onHand: 10, reserved: 0 });
    }
    return stockMap.get(key)!;
  }

  function createMockEntityManager(heldLocks: Array<() => void>) {
    const manager: any = {
      query: jest.fn().mockImplementation(async (sql: string, params: any[] = []) => {
        const lowerSql = sql.toLowerCase();
        if (lowerSql.includes('from stores') || lowerSql.includes('stores')) {
          const ref = params && params[0] ? String(params[0]) : '';
          const matched = resolveStoreRef(ref) || stores[0];
          return matched ? [matched] : [];
        }
        if (lowerSql.includes('from variants') || lowerSql.includes('variants')) {
          const ref = params && params[0] ? String(params[0]) : '';
          const matched = resolveVariantRef(ref) || variants[0];
          return matched
            ? [
                {
                  id: matched.id,
                  sku: matched.sku,
                  name: matched.name,
                  price_vnd: matched.price_vnd.toString(),
                },
              ]
            : [];
        }
        if (lowerSql.includes('from orders') || lowerSql.includes('orders')) {
          const uniqueOrders = Array.from(new Map([...ordersStore.values()].map((o) => [o.id, o])).values());
          if (typeof params?.[0] === 'boolean') {
            const isAdmin = params[0] === true;
            const custId = params[1] ? String(params[1]) : '';
            const statusFilter = params[2] ? String(params[2]) : undefined;
            const matches = uniqueOrders.filter((ord) => {
              const custMatch = isAdmin || ord.customer_id === custId;
              const statusMatch = statusFilter ? ord.status === statusFilter : true;
              return custMatch && statusMatch;
            });
            if (lowerSql.includes('count(*)')) {
              return [{ count: String(matches.length) }];
            }
            return matches;
          }

          const ref = params && params[0] ? String(params[0]) : '';
          const isAdmin = params && params[1] === true;
          const custId = params && params[2] ? String(params[2]) : '';
          for (const ord of uniqueOrders) {
            if (ord.id === ref || ord.order_no === ref) {
              if (isAdmin || ord.customer_id === custId) {
                return [ord];
              }
            }
          }
          return [];
        }
        return [];
      }),

      findOne: jest.fn().mockImplementation(async (entityClass: any, opts: any) => {
        if (entityClass === IdempotencyKey) {
          const key = opts?.where?.key;
          return idempotencyStore.get(key) || null;
        }
        if (entityClass === Inventory) {
          const storeId = opts?.where?.store_id;
          const variantId = opts?.where?.variant_id;
          const rec = getStockRecord(storeId, variantId);
          const inv = new Inventory();
          inv.store_id = storeId;
          inv.variant_id = variantId;
          inv.on_hand_qty = rec.onHand;
          inv.reserved_qty = rec.reserved;
          return inv;
        }
        if (entityClass === Order) {
          const id = opts?.where?.id;
          return ordersStore.get(id) || null;
        }
        if (entityClass === Cart) {
          const custId = opts?.where?.customerId;
          const status = opts?.where?.status || 'active';
          for (const c of cartsStore.values()) {
            if (c.customerId === custId && c.status === status) {
              const items = [...cartItemsStore.values()].filter((it) => it.cartId === c.id);
              for (const it of items) {
                if (!it.variant) {
                  it.variant = variants.find((v) => v.id === it.variantId) || variants[0];
                }
              }
              c.items = items;
              return c;
            }
          }
          return null;
        }
        if (entityClass === CartItem) {
          const id = opts?.where?.id;
          return cartItemsStore.get(id) || null;
        }
        return null;
      }),

      find: jest.fn().mockImplementation(async (entityClass: any, opts: any) => {
        if (entityClass === Order) {
          const uniqueOrders = Array.from(new Map([...ordersStore.values()].map((o) => [o.id, o])).values());
          if (opts?.where?.customer_id) {
            return uniqueOrders.filter((o) => o.customer_id === opts.where.customer_id);
          }
          return uniqueOrders;
        }
        if (entityClass === OrderItem) {
          const orderId = opts?.where?.order_id;
          return orderItemsStore.filter((i) => i.order_id === orderId);
        }
        if (entityClass === CartItem) {
          const cartId = opts?.where?.cartId;
          return [...cartItemsStore.values()].filter((i) => !cartId || i.cartId === cartId);
        }
        return [];
      }),

      create: jest.fn().mockImplementation((entityClass: any, plainObj: any) => {
        const instance = new entityClass();
        Object.assign(instance, plainObj);
        if (!instance.id) {
          instance.id = `mock-uuid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        }
        if (entityClass === Order && !instance.confirmed_at) {
          instance.confirmed_at = new Date();
        }
        return instance;
      }),

      save: jest.fn().mockImplementation(async (entity: any) => {
        if (entity instanceof IdempotencyKey) {
          idempotencyStore.set(entity.key, entity);
        } else if (entity instanceof Order) {
          ordersStore.set(entity.id, entity);
          ordersStore.set(entity.order_no, entity);
        } else if (entity instanceof OrderItem) {
          orderItemsStore.push(entity);
        } else if (entity instanceof Inventory) {
          const rec = getStockRecord(entity.store_id, entity.variant_id);
          rec.onHand = entity.on_hand_qty;
          rec.reserved = entity.reserved_qty;
        } else if (entity instanceof Cart) {
          cartsStore.set(entity.id, entity);
        } else if (entity instanceof CartItem) {
          if (!entity.variant) {
            entity.variant = variants.find((v) => v.id === entity.variantId) || variants[0];
          }
          cartItemsStore.set(entity.id, entity);
        }
        return entity;
      }),

      delete: jest.fn().mockImplementation(async (target: any) => {
        if (typeof target === 'string') {
          cartItemsStore.delete(target);
        } else if (target?.cartId) {
          for (const [id, it] of cartItemsStore.entries()) {
            if (it.cartId === target.cartId) cartItemsStore.delete(id);
          }
        } else if (target?.key) {
          idempotencyStore.delete(target.key);
        }
      }),

      createQueryBuilder: jest.fn().mockImplementation((entityClass: any, alias: string) => {
        let lockRequested = false;
        let filterStoreId = '';
        let filterVariantId = '';
        let filterOrderId = '';

        const qb: any = {
          setLock: jest.fn().mockImplementation((lockMode: string) => {
            if (lockMode === 'pessimistic_write') {
              lockRequested = true;
            }
            return qb;
          }),
          where: jest.fn().mockImplementation((clause: string, params: any) => {
            if (params?.storeId) filterStoreId = params.storeId;
            if (params?.variantId) filterVariantId = params.variantId;
            if (params?.id) filterOrderId = params.id;
            return qb;
          }),
          getOne: jest.fn().mockImplementation(async () => {
            if (alias === 'inv' || entityClass === Inventory) {
              const matchedStore = resolveStoreRef(filterStoreId) || stores[0];
              const matchedVariant = resolveVariantRef(filterVariantId) || variants[0];
              const lockKey = `${matchedStore.id}:${matchedVariant.id}`;

              if (lockRequested) {
                const releaseFn = await AsyncRowMutex.acquire(lockKey);
                heldLocks.push(releaseFn);
              }

              const rec = getStockRecord(matchedStore.id, matchedVariant.id);
              const inv = new Inventory();
              inv.store_id = matchedStore.id;
              inv.variant_id = matchedVariant.id;
              inv.on_hand_qty = rec.onHand;
              inv.reserved_qty = rec.reserved;
              return inv;
            }

            if (alias === 'ord' || entityClass === Order) {
              return ordersStore.get(filterOrderId) || null;
            }

            return null;
          }),
        };
        return qb;
      }),
    };
    return manager;
  }

  const mockDataSource: any = {
    isInitialized: true,
    setStock: (storeId: string, variantSkuOrId: string, onHand: number, reserved: number) => {
      const store = resolveStoreRef(storeId) || stores[0];
      const variant = resolveVariantRef(variantSkuOrId) || variants[0];
      const key = `${store.id}:${variant.id}`;
      stockMap.set(key, { onHand, reserved });
    },
    getStock: (storeId: string, variantSkuOrId: string) => {
      const store = resolveStoreRef(storeId) || stores[0];
      const variant = resolveVariantRef(variantSkuOrId) || variants[0];
      return getStockRecord(store.id, variant.id);
    },
    createQueryRunner: jest.fn().mockImplementation(() => {
      const heldLocks: Array<() => void> = [];
      const manager = createMockEntityManager(heldLocks);

      const releaseAllLocks = () => {
        while (heldLocks.length > 0) {
          const fn = heldLocks.pop();
          if (fn) fn();
        }
      };

      const runner: Partial<QueryRunner> = {
        manager,
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockImplementation(async () => {
          releaseAllLocks();
        }),
        rollbackTransaction: jest.fn().mockImplementation(async () => {
          releaseAllLocks();
        }),
        release: jest.fn().mockImplementation(async () => {
          releaseAllLocks();
        }),
      };
      return runner as QueryRunner;
    }),
    getRepository: jest.fn().mockImplementation((entityClass: any) => {
      if (entityClass === IdempotencyKey) {
        return {
          findOne: jest.fn().mockImplementation(async (opts: any) => {
            const key = opts?.where?.key;
            return idempotencyStore.get(key) || null;
          }),
          save: jest.fn().mockImplementation(async (item: IdempotencyKey) => {
            idempotencyStore.set(item.key, item);
            return item;
          }),
          delete: jest.fn().mockImplementation(async (opts: any) => {
            const key = opts?.key;
            if (key) idempotencyStore.delete(key);
          }),
        };
      }
      if (entityClass === Order) {
        return {
          findOne: jest.fn().mockImplementation(async (opts: any) => {
            const id = opts?.where?.id;
            return ordersStore.get(id) || null;
          }),
          find: jest.fn().mockImplementation(async (opts: any) => {
            const uniqueOrders = Array.from(new Map([...ordersStore.values()].map((o) => [o.id, o])).values());
            if (opts?.where?.customer_id) {
              return uniqueOrders.filter((o) => o.customer_id === opts.where.customer_id);
            }
            return uniqueOrders;
          }),
        };
      }
      if (entityClass === OrderItem) {
        return {
          find: jest.fn().mockImplementation(async (opts: any) => {
            const orderId = opts?.where?.order_id;
            return orderItemsStore.filter((i) => i.order_id === orderId);
          }),
        };
      }
      if (entityClass === Cart) {
        return {
          findOne: jest.fn().mockImplementation(async (opts: any) => {
            const custId = opts?.where?.customerId;
            const status = opts?.where?.status || 'active';
            for (const c of cartsStore.values()) {
              if (c.customerId === custId && c.status === status) {
                const items = [...cartItemsStore.values()].filter((it) => it.cartId === c.id);
                for (const it of items) {
                  if (!it.variant) {
                    it.variant = variants.find((v) => v.id === it.variantId) || variants[0];
                  }
                }
                c.items = items;
                return c;
              }
            }
            return null;
          }),
          create: jest.fn().mockImplementation((plain: any) => {
            const c = new Cart();
            Object.assign(c, plain);
            if (!c.id) c.id = `mock-cart-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            if (!c.items) c.items = [];
            return c;
          }),
          save: jest.fn().mockImplementation(async (c: Cart) => {
            cartsStore.set(c.id, c);
            return c;
          }),
        };
      }
      if (entityClass === CartItem) {
        return {
          findOne: jest.fn().mockImplementation(async (opts: any) => {
            const id = opts?.where?.id;
            return cartItemsStore.get(id) || null;
          }),
          find: jest.fn().mockImplementation(async (opts: any) => {
            const cartId = opts?.where?.cartId;
            return [...cartItemsStore.values()].filter((i) => !cartId || i.cartId === cartId);
          }),
          create: jest.fn().mockImplementation((plain: any) => {
            const item = new CartItem();
            Object.assign(item, plain);
            if (!item.id) item.id = `mock-cart-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            if (!item.variant) {
              item.variant = variants.find((v) => v.id === item.variantId) || variants[0];
            }
            return item;
          }),
          save: jest.fn().mockImplementation(async (item: CartItem) => {
            if (!item.variant) {
              item.variant = variants.find((v) => v.id === item.variantId) || variants[0];
            }
            cartItemsStore.set(item.id, item);
            return item;
          }),
          delete: jest.fn().mockImplementation(async (target: any) => {
            if (typeof target === 'string') {
              cartItemsStore.delete(target);
            } else if (target?.cartId) {
              for (const [id, it] of cartItemsStore.entries()) {
                if (it.cartId === target.cartId) cartItemsStore.delete(id);
              }
            }
            return { affected: 1 };
          }),
        };
      }
      return null;
    }),
    manager: createMockEntityManager([]),
  };

  mockDataSource.transaction = jest.fn().mockImplementation(async (levelOrExecute: any, execute?: any) => {
    const callback = execute || levelOrExecute;
    return callback({ ...mockDataSource.manager, getRepository: mockDataSource.getRepository });
  });
  return mockDataSource;
}

