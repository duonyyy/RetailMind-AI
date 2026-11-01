import { BadRequestException, ConflictException } from '@nestjs/common';
import { getAgentOperationStatus, transactionalIdempotency } from './transactional-idempotency';

describe('transactional idempotency (mock manager)', () => {
  const key = '9d493fb7-ef26-4fc2-8e55-0d131047d21b';
  let records: Map<string, any>;
  let manager: any;
  beforeEach(() => {
    records = new Map();
    manager = { query: jest.fn(async (sql: string, params: any[]) => {
      if (sql.includes('pg_try_advisory_xact_lock')) return [{ locked: true }];
      if (sql.startsWith('SELECT status')) return records.has(params[0]) ? [records.get(params[0])] : [];
      if (sql.startsWith('INSERT')) { records.set(params[0], { status: params[1], response_payload: null }); return []; }
      if (sql.startsWith('UPDATE')) { records.set(params[0], { status: params[1], response_payload: JSON.parse(params[2]) }); return []; }
      throw new Error('unexpected SQL');
    }) };
  });
  it('replays identical operation without executing again and rejects changed payload or operation', async () => {
    const execute = jest.fn(async () => ({ ticket_id: 'TCK-1' }));
    const run = (payload: any, operation = 'create_support_ticket') =>
      transactionalIdempotency(manager, 'alice', operation, key, payload, execute);
    expect(await run({ order: 'ORDER-1' })).toEqual({ ticket_id: 'TCK-1' });
    expect(await run({ order: 'ORDER-1' })).toEqual({ ticket_id: 'TCK-1' });
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(run({ order: 'ORDER-2' })).rejects.toThrow(ConflictException);
    await expect(run({ order: 'ORDER-1' }, 'another_operation')).rejects.toThrow(ConflictException);
  });
  it('rejects malformed keys without touching persistence', async () => {
    await expect(transactionalIdempotency(manager, 'alice', 'ticket', 'bad', {}, async () => ({})))
      .rejects.toThrow(BadRequestException);
    expect(manager.query).not.toHaveBeenCalled();
  });
  it('returns conflict when another transaction owns the key', async () => {
    manager.query.mockResolvedValueOnce([{ locked: false }]);
    const execute = jest.fn();
    await expect(transactionalIdempotency(manager, 'alice', 'ticket', key, {}, execute)).rejects.toThrow(ConflictException);
    expect(execute).not.toHaveBeenCalled();
  });
  it('reports only the authenticated actor\'s committed operation without exposing the saved payload', async () => {
    await transactionalIdempotency(manager, 'alice', 'ticket', key, {}, async () => ({ private: 'secret' }));
    expect(await getAgentOperationStatus(manager, 'alice', key)).toEqual({ outcome: 'confirmed', operation: 'ticket' });
    expect(await getAgentOperationStatus(manager, 'bob', key)).toEqual({ outcome: 'unknown' });
  });
  it('treats missing and unfinished records as unknown, never as proof of failure', async () => {
    expect(await getAgentOperationStatus(manager, 'alice', key)).toEqual({ outcome: 'unknown' });
    records.set(`agent:alice:${key}`, { status: 'processing', response_payload: null });
    expect(await getAgentOperationStatus(manager, 'alice', key)).toEqual({ outcome: 'unknown' });
    await expect(getAgentOperationStatus(manager, 'alice', 'bad')).rejects.toThrow(BadRequestException);
  });
});
