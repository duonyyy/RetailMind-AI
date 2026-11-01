import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { Inventory } from '../entities/inventory.entity';
import { AuditService } from '../../audit/public-api';

export interface StoreDTO { id: string; code: string; name: string; address: string; phone: string; }
export interface StockDTO { storeId: string; storeName: string; variantId: string; onHandQty: number; reservedQty: number; availableQty: number; isAvailable: boolean; }
export interface ReserveItemInput { variantId: string; quantity: number; }

@Injectable()
export class InventoryService {
  constructor(
    @Optional() private readonly dataSource?: DataSource,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  private db(): DataSource {
    if (!this.dataSource?.isInitialized) throw new ServiceUnavailableException('Dữ liệu tồn kho hiện không khả dụng.');
    return this.dataSource;
  }

  async resolveStore(manager: EntityManager, reference: string): Promise<{ id: string; code: string; name: string }> {
    if (typeof reference !== 'string' || !reference.trim()) throw new BadRequestException('Cần chọn cửa hàng.');
    const rows = await manager.query('SELECT id, code, name FROM stores WHERE is_active = true AND (id::text = $1 OR code = $1)', [reference.trim()]);
    if (!rows.length) throw new NotFoundException('Không tìm thấy cửa hàng đang hoạt động.');
    return rows[0];
  }

  async resolveVariant(manager: EntityManager, reference: string): Promise<{ id: string; sku: string; name: string; price_vnd: string }> {
    if (typeof reference !== 'string' || !reference.trim()) throw new BadRequestException('Cần cung cấp mã sản phẩm.');
    const rows = await manager.query('SELECT id, sku, name, price_vnd FROM variants WHERE is_active = true AND (id::text = $1 OR sku = $1)', [reference.trim()]);
    if (!rows.length) throw new NotFoundException('Không tìm thấy sản phẩm đang kinh doanh.');
    return rows[0];
  }

  async getStores(): Promise<StoreDTO[]> {
    const rows = await this.db().manager.query('SELECT id, code, name, display_address, phone_number FROM stores WHERE is_active = true ORDER BY name');
    return rows.map((r: any) => ({ id: r.id, code: r.code, name: r.name, address: r.display_address || '', phone: r.phone_number || '' }));
  }

  async getInventoryMatrix(): Promise<any[]> {
    const rows = await this.db().manager.query(`
      SELECT 
        i.store_id AS "storeId",
        s.code AS "branchCode",
        s.name AS "branchName",
        v.id AS "variantId",
        v.sku AS "sku",
        v.name AS "name",
        i.on_hand_qty AS "physicalQty",
        i.reserved_qty AS "reservedQty",
        (i.on_hand_qty - i.reserved_qty) AS "availableQty",
        5 AS "safetyThreshold",
        i.updated_at AS "lastUpdated"
      FROM inventory i
      JOIN stores s ON s.id = i.store_id
      JOIN variants v ON v.id = i.variant_id
      WHERE s.is_active = true AND v.is_active = true
      ORDER BY s.code ASC, v.sku ASC
    `);
    return rows.map((r: any) => ({
      id: `${r.storeId}-${r.variantId}`,
      ...r,
      physicalQty: Number(r.physicalQty),
      reservedQty: Number(r.reservedQty),
      availableQty: Number(r.availableQty),
      safetyThreshold: Number(r.safetyThreshold),
      lastUpdated: new Date(r.lastUpdated || Date.now()).toLocaleString('vi-VN'),
    }));
  }

  async getStock(storeId: string, variantId: string, transactionManager?: EntityManager): Promise<StockDTO> {
    const manager = transactionManager || this.db().manager;
    const store = await this.resolveStore(manager, storeId);
    const variant = await this.resolveVariant(manager, variantId);
    const inventory = await manager.findOne(Inventory, { where: { store_id: store.id, variant_id: variant.id } });
    if (!inventory) throw new NotFoundException('Không tìm thấy dữ liệu tồn kho tại cửa hàng.');
    const available = inventory.on_hand_qty - inventory.reserved_qty;
    return { storeId: store.id, storeName: store.name, variantId: variant.id, onHandQty: inventory.on_hand_qty, reservedQty: inventory.reserved_qty, availableQty: available, isAvailable: available > 0 };
  }

  async reserveMultipleWithLock(queryRunner: QueryRunner, storeId: string, items: ReserveItemInput[]): Promise<void> {
    if (!items?.length) throw new BadRequestException('Danh sách sản phẩm không được rỗng.');
    const store = await this.resolveStore(queryRunner.manager, storeId);
    const quantities = new Map<string, number>();
    for (const item of items) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new BadRequestException('Số lượng phải là số nguyên dương.');
      const variant = await this.resolveVariant(queryRunner.manager, item.variantId);
      quantities.set(variant.id, (quantities.get(variant.id) || 0) + item.quantity);
    }
    for (const [variantId, quantity] of [...quantities].sort(([a], [b]) => a.localeCompare(b))) {
      const inventory = await queryRunner.manager.createQueryBuilder(Inventory, 'inv').setLock('pessimistic_write')
        .where('inv.store_id = :storeId AND inv.variant_id = :variantId', { storeId: store.id, variantId }).getOne();
      if (!inventory) throw new NotFoundException('Không tìm thấy dữ liệu tồn kho tại cửa hàng.');
      if (inventory.on_hand_qty - inventory.reserved_qty < quantity) throw new ConflictException('Số lượng tồn kho khả dụng không đủ.');
      inventory.reserved_qty += quantity;
      await queryRunner.manager.save(inventory);
    }
  }

  async restoreStockInTx(queryRunner: QueryRunner, storeId: string, items: ReserveItemInput[]): Promise<void> {
    const store = await this.resolveStore(queryRunner.manager, storeId);
    for (const item of [...items].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
      const inventory = await queryRunner.manager.createQueryBuilder(Inventory, 'inv').setLock('pessimistic_write')
        .where('inv.store_id = :storeId AND inv.variant_id = :variantId', { storeId: store.id, variantId: item.variantId }).getOne();
      if (!inventory || inventory.reserved_qty < item.quantity) throw new ConflictException('Không thể xác nhận số lượng tồn kho cần hoàn.');
      inventory.reserved_qty -= item.quantity;
      await queryRunner.manager.save(inventory);
    }
  }

  async commitStockInTx(queryRunner: QueryRunner, storeId: string, items: ReserveItemInput[]): Promise<void> {
    const store = await this.resolveStore(queryRunner.manager, storeId);
    for (const item of [...items].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
      const inventory = await queryRunner.manager.createQueryBuilder(Inventory, 'inv').setLock('pessimistic_write')
        .where('inv.store_id = :storeId AND inv.variant_id = :variantId', { storeId: store.id, variantId: item.variantId }).getOne();
      if (inventory) {
        inventory.reserved_qty = Math.max(0, inventory.reserved_qty - item.quantity);
        inventory.on_hand_qty = Math.max(0, inventory.on_hand_qty - item.quantity);
        await queryRunner.manager.save(inventory);
      }
    }
  }

  async adjustInventory(
    storeId: string,
    variantId: string,
    newOnHandQty: number,
    reason: string,
    actorId = 'admin',
  ): Promise<{
    storeId: string;
    storeCode: string;
    variantId: string;
    sku: string;
    onHandQty: number;
    reservedQty: number;
    availableQty: number;
    reason: string;
  }> {
    if (typeof newOnHandQty !== 'number' || !Number.isSafeInteger(newOnHandQty) || newOnHandQty < 0) {
      throw new BadRequestException('Số lượng tồn kho mới phải là số nguyên không âm (>= 0).');
    }
    if (!reason?.trim()) {
      throw new BadRequestException('Cần cung cấp lý do điều chỉnh tồn kho.');
    }

    const runner = this.db().createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      try {
        const store = await this.resolveStore(runner.manager, storeId);
        const variant = await this.resolveVariant(runner.manager, variantId);

        const inventory = await runner.manager
          .createQueryBuilder(Inventory, 'inv')
          .setLock('pessimistic_write')
          .where('inv.store_id = :storeId AND inv.variant_id = :variantId', {
            storeId: store.id,
            variantId: variant.id,
          })
          .getOne();

        if (!inventory) {
          throw new NotFoundException('Không tìm thấy dữ liệu tồn kho tại cửa hàng.');
        }

        if (newOnHandQty < inventory.reserved_qty) {
          throw new ConflictException(
            `Số lượng tồn kho mới (${newOnHandQty}) không được nhỏ hơn số lượng đang giữ chỗ (${inventory.reserved_qty}).`,
          );
        }

        const beforeOnHand = inventory.on_hand_qty;
        inventory.on_hand_qty = newOnHandQty;
        await runner.manager.save(inventory);

        if (this.auditService) {
          await this.auditService.logEvent(
            {
              actorId,
              action: 'INVENTORY_ADJUST',
              entityType: 'Inventory',
              entityId: `${store.id}:${variant.id}`,
              payload: {
                storeId: store.id,
                storeCode: store.code,
                variantId: variant.id,
                sku: variant.sku,
                beforeOnHand,
                newOnHand: newOnHandQty,
                reservedQty: inventory.reserved_qty,
                availableQty: newOnHandQty - inventory.reserved_qty,
                reason: reason.trim(),
              },
            },
            runner.manager,
          );
        }

        await runner.commitTransaction();

        return {
          storeId: store.id,
          storeCode: store.code,
          variantId: variant.id,
          sku: variant.sku,
          onHandQty: inventory.on_hand_qty,
          reservedQty: inventory.reserved_qty,
          availableQty: inventory.on_hand_qty - inventory.reserved_qty,
          reason: reason.trim(),
        };
      } catch (error) {
        await runner.rollbackTransaction();
        throw error;
      }
    } finally {
      await runner.release();
    }
  }

  async reserveStock(storeId: string, variantId: string, quantity: number, actorId = 'admin'): Promise<void> {
    const runner = this.db().createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      try {
        await this.reserveMultipleWithLock(runner, storeId, [{ variantId, quantity }]);
        if (this.auditService) {
          await this.auditService.logEvent(
            {
              actorId,
              action: 'INVENTORY_RESERVE',
              entityType: 'Inventory',
              entityId: `${storeId}:${variantId}`,
              payload: { storeId, variantId, quantity },
            },
            runner.manager,
          );
        }
        await runner.commitTransaction();
      } catch (error) {
        await runner.rollbackTransaction();
        throw error;
      }
    } finally {
      await runner.release();
    }
  }
}
