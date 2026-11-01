/* Runs only against a deliberately created disposable database, never the app database. */
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { SupportService } from './support.service';
import { SupportTicket, Order, OrderItem, OrdersService } from '../orders/public-api';
import { CustomersService, Favorite } from '../customers/public-api';
import { User, Role } from '../auth/public-api';
import { Variant } from '../catalog/public-api';
import { Inventory, InventoryService } from '../inventory/public-api';
import { Cart, CartItem, CartService } from '../cart/public-api';
import { getAgentOperationStatus } from '../../shared/idempotency/transactional-idempotency';

const isolatedUrl = process.env.RETAILMIND_ISOLATED_DB_URL;
const isolated = isolatedUrl ? new URL(isolatedUrl) : undefined;
const permitted = isolated && ['127.0.0.1', 'localhost'].includes(isolated.hostname)
  && isolated.pathname === '/retailmind_idem_isolated' && isolated.username === 'idem_fixture';
const suite = permitted ? describe : describe.skip;

suite('Core agent mutation idempotency on disposable PostgreSQL', () => {
  const schema = `idem_${randomUUID().replace(/-/g, '')}`;
  const customer = '00000000-0000-4000-8000-000000000001';
  const order = '00000000-0000-4000-8000-000000000002';
  const store = '00000000-0000-4000-8000-000000000004';
  const key = '9d493fb7-ef26-4fc2-8e55-0d131047d21b';
  const input = { orderId: order, title: 'Test ticket', description: 'Fixture only', confirmedProfilePhone: '0900000000' };
  const entities = [SupportTicket, Favorite, User, Role, Variant, Order, OrderItem, Inventory, Cart, CartItem];
  let admin: DataSource;
  let db: DataSource;
  let service: SupportService;

  beforeAll(async () => {
    admin = await new DataSource({ type: 'postgres', url: isolatedUrl }).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = await new DataSource({ type: 'postgres', url: isolatedUrl, entities,
      extra: { options: `-c search_path=${schema},public` } }).initialize();
    await db.query('CREATE TABLE users (id uuid PRIMARY KEY, phone_number text, is_active boolean)');
    await db.query("CREATE TABLE orders (id uuid PRIMARY KEY, customer_id uuid, order_no text, store_id uuid, idempotency_key_id uuid, status varchar(32) DEFAULT 'placed', total_vnd numeric(18,0) DEFAULT 100, confirmed_at timestamptz DEFAULT now(), cancelled_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())");
    await db.query('CREATE TABLE order_items (id uuid PRIMARY KEY, order_id uuid, variant_id uuid, sku_snapshot text, title_snapshot text, unit_price_vnd numeric(18,0), quantity int, line_total_vnd numeric(18,0), created_at timestamptz DEFAULT now())');
    await db.query('CREATE TABLE stores (id uuid PRIMARY KEY, code text, name text, is_active boolean)');
    await db.query('CREATE TABLE inventory (store_id uuid, variant_id uuid, on_hand_qty int, reserved_qty int, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), PRIMARY KEY (store_id, variant_id))');
    await db.query('CREATE TABLE variants (id uuid PRIMARY KEY, product_id uuid, sku text, name text, price_vnd numeric(18,0), ram_gb int, storage_gb int, cpu_model text, gpu_model text, is_active boolean, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())');
    await db.query("CREATE TABLE carts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid, status varchar(32) DEFAULT 'active', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())");
    await db.query('CREATE TABLE cart_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cart_id uuid, variant_id uuid, quantity int, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE (cart_id, variant_id))');
    await db.query('CREATE TABLE idempotency_keys (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key varchar(255) UNIQUE NOT NULL, status varchar(32) NOT NULL, response_payload jsonb)');
    await db.query('CREATE TABLE support_tickets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_code varchar(50) UNIQUE NOT NULL, customer_id varchar(100) NOT NULL, order_id varchar(100), title varchar(255), description text, status varchar(50), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())');
    await db.query('CREATE TABLE favorites (customer_id uuid NOT NULL, variant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (customer_id, variant_id))');
    await db.query('INSERT INTO users VALUES ($1, $2, true)', [customer, input.confirmedProfilePhone]);
    await db.query('INSERT INTO stores (id, code, name, is_active) VALUES ($1, $2, $3, true)', [store, 'FIXTURE', 'Fixture']);
    await db.query('INSERT INTO variants (id, product_id, sku, name, price_vnd, is_active) VALUES ($1, $2, $3, $4, 100, true)', ['00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000006', 'ABC', 'Fixture']);
    await db.query('INSERT INTO orders (id, customer_id, order_no, store_id) VALUES ($1, $2, $3, $4)', [order, customer, 'ORDER-FIXTURE', store]);
    service = new SupportService(db.getRepository(SupportTicket), db);
  }, 30000);

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (admin?.isInitialized) {
      if (!/^idem_[0-9a-f]{32}$/.test(schema)) throw new Error('Unexpected fixture schema');
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.destroy();
    }
  }, 30000);

  it('commits one ticket, allows safe replay after reconnect and rejects payload changes', async () => {
    const attempts = await Promise.allSettled([service.createTicket(customer, input, key), service.createTicket(customer, input, key)]);
    expect(attempts.some((attempt) => attempt.status === 'fulfilled')).toBe(true);
    expect((await db.query('SELECT count(*)::int AS n FROM support_tickets'))[0].n).toBe(1);
    const first = await service.createTicket(customer, input, key);
    await db.destroy();
    db = await new DataSource({ type: 'postgres', url: isolatedUrl, entities,
      extra: { options: `-c search_path=${schema},public` } }).initialize();
    service = new SupportService(db.getRepository(SupportTicket), db);
    const replay = await service.createTicket(customer, input, key);
    expect(replay).toEqual(first);
    expect(await getAgentOperationStatus(db.manager, customer, key)).toEqual({ outcome: 'confirmed', operation: 'create_support_ticket' });
    expect(await getAgentOperationStatus(db.manager, '00000000-0000-4000-8000-000000000009', key)).toEqual({ outcome: 'unknown' });
    await expect(service.createTicket(customer, { ...input, title: 'Different request' }, key)).rejects.toThrow();
    expect((await db.query('SELECT count(*)::int AS n FROM support_tickets'))[0].n).toBe(1);
  }, 30000);

  it('rolls back ticket and idempotency record if result persistence fails', async () => {
    await db.query("ALTER TABLE idempotency_keys ADD CONSTRAINT fixture_no_completed CHECK (status <> 'completed') NOT VALID");
    const key2 = '9d493fb7-ef26-4fc2-8e55-0d131047d21c';
    try {
      await expect(service.createTicket(customer, input, key2)).rejects.toThrow();
      expect((await db.query('SELECT count(*)::int AS n FROM support_tickets'))[0].n).toBe(1);
      expect((await db.query('SELECT count(*)::int AS n FROM idempotency_keys WHERE key LIKE $1', [`%${key2}`]))[0].n).toBe(0);
    } finally {
      await db.query('ALTER TABLE idempotency_keys DROP CONSTRAINT fixture_no_completed');
    }
  });

  it('replays a favorite toggle without toggling it twice', async () => {
    const variant = '00000000-0000-4000-8000-000000000003';
    const favoriteKey = '9d493fb7-ef26-4fc2-8e55-0d131047d21d';
    const favorites = new CustomersService({} as any, db.getRepository(Favorite), db);
    const attempts = await Promise.allSettled([
      favorites.setFavoriteIdempotent(customer, variant, 'toggle', favoriteKey),
      favorites.setFavoriteIdempotent(customer, variant, 'toggle', favoriteKey),
    ]);
    expect(attempts.some(attempt => attempt.status === 'fulfilled')).toBe(true);
    expect(await favorites.setFavoriteIdempotent(customer, variant, 'toggle', favoriteKey)).toEqual({ isFavorited: true });
    expect((await db.query('SELECT count(*)::int AS n FROM favorites'))[0].n).toBe(1);
    await expect(favorites.setFavoriteIdempotent(customer, variant, 'remove', favoriteKey)).rejects.toThrow();
    expect((await db.query('SELECT count(*)::int AS n FROM favorites'))[0].n).toBe(1);
  }, 30000);

  it('replays cancellation without restoring stock twice and rejects another customer', async () => {
    const variant = '00000000-0000-4000-8000-000000000003';
    const item = '00000000-0000-4000-8000-000000000005';
    const cancelKey = '9d493fb7-ef26-4fc2-8e55-0d131047d21e';
    await db.query('INSERT INTO inventory (store_id, variant_id, on_hand_qty, reserved_qty) VALUES ($1, $2, 5, 2)', [store, variant]);
    await db.query('INSERT INTO order_items (id, order_id, variant_id, sku_snapshot, title_snapshot, unit_price_vnd, quantity, line_total_vnd) VALUES ($1, $2, $3, $4, $5, 100, 2, 200)', [item, order, variant, 'ABC', 'Fixture']);
    const orders = new OrdersService({} as any, new InventoryService(db), db);
    const principal = { id: customer, role: 'CUSTOMER' };
    const attempts = await Promise.allSettled([
      orders.cancelOrder(order, 'Fixture cancellation', principal, cancelKey),
      orders.cancelOrder(order, 'Fixture cancellation', principal, cancelKey),
    ]);
    expect(attempts.some(attempt => attempt.status === 'fulfilled')).toBe(true);
    const replay = await orders.cancelOrder(order, 'Fixture cancellation', principal, cancelKey);
    expect(replay.status).toBe('CANCELLED');
    expect((await db.query('SELECT reserved_qty FROM inventory WHERE store_id = $1 AND variant_id = $2', [store, variant]))[0].reserved_qty).toBe(0);
    await expect(orders.cancelOrder(order, 'Fixture cancellation', { id: '00000000-0000-4000-8000-000000000099', role: 'CUSTOMER' }, cancelKey)).rejects.toThrow();
    await expect(orders.cancelOrder(order, 'Changed reason', principal, cancelKey)).rejects.toThrow();
  }, 30000);

  it('replays cart add and remove without repeating mutations', async () => {
    const cart = new CartService({} as any, new InventoryService(db), undefined, undefined, db);
    const addKey = '9d493fb7-ef26-4fc2-8e55-0d131047d21f';
    const removeKey = '9d493fb7-ef26-4fc2-8e55-0d131047d220';
    const inputCart = { sku: 'ABC', quantity: 2, storeId: store };
    const attempts = await Promise.allSettled([
      cart.addItemIdempotent(customer, inputCart, addKey),
      cart.addItemIdempotent(customer, inputCart, addKey),
    ]);
    expect(attempts.some(attempt => attempt.status === 'fulfilled')).toBe(true);
    const added = await cart.addItemIdempotent(customer, inputCart, addKey);
    expect(added.itemsCount).toBe(2);
    expect((await db.query('SELECT quantity FROM cart_items'))[0].quantity).toBe(2);
    await expect(cart.addItemIdempotent(customer, { ...inputCart, quantity: 3 }, addKey)).rejects.toThrow();
    const removed = await cart.removeItemIdempotent(customer, 'ABC', store, removeKey);
    expect(removed.itemsCount).toBe(0);
    expect((await cart.removeItemIdempotent(customer, 'ABC', store, removeKey)).itemsCount).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM cart_items'))[0].n).toBe(0);
  }, 30000);

  it('replays safely when the client times out after the ticket transaction commits', async () => {
    const timeoutKey = '9d493fb7-ef26-4fc2-8e55-0d131047d221';
    let signalCommitted: () => void;
    const committed = new Promise<void>(resolve => { signalCommitted = resolve; });
    const delayedResponse = service.createTicket(customer, input, timeoutKey).then(async result => {
      signalCommitted();
      await new Promise(resolve => setTimeout(resolve, 60));
      return result;
    });
    await committed;
    const client = await Promise.race([delayedResponse.then(() => 'response'), new Promise(resolve => setTimeout(() => resolve('timeout'), 5))]);
    expect(client).toBe('timeout');
    const replay = await service.createTicket(customer, input, timeoutKey);
    expect(await delayedResponse).toEqual(replay);
    expect((await db.query('SELECT count(*)::int AS n FROM support_tickets'))[0].n).toBe(2);
  }, 30000);

  it('rolls back favorite and cart writes when idempotency result persistence fails', async () => {
    const variant = '00000000-0000-4000-8000-000000000003';
    const favorites = new CustomersService({} as any, db.getRepository(Favorite), db);
    const cart = new CartService({} as any, new InventoryService(db), undefined, undefined, db);
    await db.query("ALTER TABLE idempotency_keys ADD CONSTRAINT fixture_no_completed CHECK (status <> 'completed') NOT VALID");
    try {
      await expect(favorites.setFavoriteIdempotent(customer, variant, 'remove', '9d493fb7-ef26-4fc2-8e55-0d131047d222')).rejects.toThrow();
      expect((await db.query('SELECT count(*)::int AS n FROM favorites'))[0].n).toBe(1);
      await expect(cart.addItemIdempotent(customer, { sku: 'ABC', quantity: 1, storeId: store }, '9d493fb7-ef26-4fc2-8e55-0d131047d223')).rejects.toThrow();
      expect((await db.query('SELECT count(*)::int AS n FROM cart_items'))[0].n).toBe(0);
    } finally {
      await db.query('ALTER TABLE idempotency_keys DROP CONSTRAINT fixture_no_completed');
    }
  }, 30000);

  it('rolls back cancellation and inventory restoration when result persistence fails', async () => {
    const order2 = '00000000-0000-4000-8000-000000000007';
    const variant = '00000000-0000-4000-8000-000000000003';
    const item2 = '00000000-0000-4000-8000-000000000008';
    await db.query('UPDATE inventory SET reserved_qty = 2 WHERE store_id = $1 AND variant_id = $2', [store, variant]);
    await db.query('INSERT INTO orders (id, customer_id, order_no, store_id) VALUES ($1, $2, $3, $4)', [order2, customer, 'ORDER-ROLLBACK', store]);
    await db.query('INSERT INTO order_items (id, order_id, variant_id, sku_snapshot, title_snapshot, unit_price_vnd, quantity, line_total_vnd) VALUES ($1, $2, $3, $4, $5, 100, 2, 200)', [item2, order2, variant, 'ABC', 'Fixture']);
    await db.query("ALTER TABLE idempotency_keys ADD CONSTRAINT fixture_no_completed CHECK (status <> 'completed') NOT VALID");
    try {
      const orders = new OrdersService({} as any, new InventoryService(db), db);
      await expect(orders.cancelOrder(order2, 'Fixture', { id: customer, role: 'CUSTOMER' }, '9d493fb7-ef26-4fc2-8e55-0d131047d224')).rejects.toThrow();
      expect((await db.query('SELECT status FROM orders WHERE id = $1', [order2]))[0].status).toBe('placed');
      expect((await db.query('SELECT reserved_qty FROM inventory WHERE store_id = $1 AND variant_id = $2', [store, variant]))[0].reserved_qty).toBe(2);
    } finally {
      await db.query('ALTER TABLE idempotency_keys DROP CONSTRAINT fixture_no_completed');
    }
  }, 30000);
});
