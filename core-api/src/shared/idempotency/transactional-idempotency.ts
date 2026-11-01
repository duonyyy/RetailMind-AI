import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { EntityManager } from 'typeorm';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getAgentOperationStatus(manager: EntityManager, actorId: string, key: string | undefined) {
  if (typeof key !== 'string' || !UUID_V4.test(key)) {
    throw new BadRequestException('Idempotency-Key phải là UUIDv4.');
  }
  const scopedKey = `agent:${actorId}:${key.toLowerCase()}`;
  const rows = await manager.query('SELECT status, response_payload FROM idempotency_keys WHERE key = $1', [scopedKey]);
  const row = rows[0];
  // Absence cannot distinguish an in-flight transaction from one that never ran.
  if (!row || row.status !== 'completed' || !row.response_payload ||
      !Object.prototype.hasOwnProperty.call(row.response_payload, 'result')) {
    return { outcome: 'unknown' as const };
  }
  return { outcome: 'confirmed' as const, operation: typeof row.response_payload.operation === 'string' ? row.response_payload.operation : null };
}

/** Call only within the same transaction as the business mutation. */
export async function transactionalIdempotency<T>(
  manager: EntityManager,
  actorId: string,
  operation: string,
  key: string | undefined,
  payload: unknown,
  execute: () => Promise<T>,
): Promise<T> {
  if (typeof key !== 'string' || !UUID_V4.test(key)) {
    throw new BadRequestException('Idempotency-Key phải là UUIDv4.');
  }
  const scopedKey = `agent:${actorId}:${key.toLowerCase()}`;
  const requestHash = createHash('sha256').update(JSON.stringify({ operation, payload })).digest('hex');
  const lock = await manager.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked', [scopedKey]);
  if (!lock[0]?.locked) throw new ConflictException('Thao tác với khóa này đang được xử lý.');
  const rows = await manager.query('SELECT status, response_payload FROM idempotency_keys WHERE key = $1 FOR UPDATE', [scopedKey]);
  if (rows.length) {
    const saved = rows[0].response_payload;
    if (!saved || saved.request_hash !== requestHash) {
      throw new ConflictException('Idempotency-Key đã được dùng cho yêu cầu khác.');
    }
    if (rows[0].status !== 'completed' || !Object.prototype.hasOwnProperty.call(saved, 'result')) {
      throw new ConflictException('Không thể xác nhận kết quả thao tác trước đó.');
    }
    return saved.result as T;
  }
  await manager.query('INSERT INTO idempotency_keys (key, status) VALUES ($1, $2)', [scopedKey, 'processing']);
  const result = await execute();
  await manager.query('UPDATE idempotency_keys SET status = $2, response_payload = $3::jsonb WHERE key = $1',
    [scopedKey, 'completed', JSON.stringify({ request_hash: requestHash, operation, result })]);
  return result;
}
