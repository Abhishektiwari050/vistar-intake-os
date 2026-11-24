import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestDbSingleton, getDb } from '@/lib/db/client';
import { blueprints, mappingMemory } from '@/lib/db/schema';
import { GET as getMappingMemory } from '@app/api/mapping-memory/route';
import { DELETE as deleteMappingMemory } from '@app/api/mapping-memory/[id]/route';
import { eq } from 'drizzle-orm';

describe('Mapping Memory Management API Route Handlers', () => {
  beforeEach(() => {
    resetTestDbSingleton();
  });

  it('GET /api/mapping-memory returns empty list when no mappings exist', async () => {
    const res = await getMappingMemory();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it('GET /api/mapping-memory returns joined blueprint metadata and mapping signatures', async () => {
    const db = await getDb();

    // Query seeded blueprint
    const seedBlueprints = await db.select().from(blueprints).limit(1);
    expect(seedBlueprints.length).toBeGreaterThan(0);
    const bp = seedBlueprints[0];

    // Seed a mapping memory signature
    const headerHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const mappingJson = {
      sku: 'Article Code',
      title: 'Item Description',
      price: 'Net MRP',
    };

    const inserted = await db
      .insert(mappingMemory)
      .values({
        blueprintId: bp.id,
        headerHash,
        mappingJson,
        hitCount: 7,
      })
      .returning();

    expect(inserted.length).toBe(1);

    const res = await getMappingMemory();
    expect(res.status).toBe(200);
    const records = await res.json();
    expect(records.length).toBe(1);

    const record = records[0];
    expect(record.id).toBe(inserted[0].id);
    expect(record.blueprintId).toBe(bp.id);
    expect(record.blueprintTitle).toBe(bp.name);
    expect(record.blueprintSlug).toBe(bp.slug);
    expect(record.headerHash).toBe(headerHash);
    expect(record.mappingJson).toEqual(mappingJson);
    expect(record.hitCount).toBe(7);
    expect(record.createdAt).toBeDefined();
  });

  it('DELETE /api/mapping-memory/[id] deletes cached mapping and validates UUID format', async () => {
    const db = await getDb();
    const seedBlueprints = await db.select().from(blueprints).limit(1);
    const bp = seedBlueprints[0];

    // 1. Invalid UUID format -> 400
    const invalidReq = new Request('http://localhost/api/mapping-memory/invalid-uuid', {
      method: 'DELETE',
    });
    const resInvalid = await deleteMappingMemory(invalidReq, {
      params: Promise.resolve({ id: 'invalid-uuid-format' }),
    });
    expect(resInvalid.status).toBe(400);
    const errBody = await resInvalid.json();
    expect(errBody.error).toBe('Invalid mapping memory UUID format');

    // 2. Non-existent UUID -> 404
    const nonExistentId = '00000000-0000-4000-8000-000000000000';
    const nonExistentReq = new Request(`http://localhost/api/mapping-memory/${nonExistentId}`, {
      method: 'DELETE',
    });
    const res404 = await deleteMappingMemory(nonExistentReq, {
      params: Promise.resolve({ id: nonExistentId }),
    });
    expect(res404.status).toBe(404);
    const notFoundBody = await res404.json();
    expect(notFoundBody.error).toBe('Mapping memory entry not found');

    // 3. Successful deletion -> 200
    const [inserted] = await db
      .insert(mappingMemory)
      .values({
        blueprintId: bp.id,
        headerHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        mappingJson: { sku: 'Item No' },
        hitCount: 3,
      })
      .returning();

    const deleteReq = new Request(`http://localhost/api/mapping-memory/${inserted.id}`, {
      method: 'DELETE',
    });
    const resDelete = await deleteMappingMemory(deleteReq, {
      params: Promise.resolve({ id: inserted.id }),
    });

    expect(resDelete.status).toBe(200);
    const deleteBody = await resDelete.json();
    expect(deleteBody.success).toBe(true);
    expect(deleteBody.deletedId).toBe(inserted.id);

    // Verify record is removed from DB
    const inDb = await db.select().from(mappingMemory).where(eq(mappingMemory.id, inserted.id));
    expect(inDb.length).toBe(0);

    // Subsequent GET returns empty
    const resGet = await getMappingMemory();
    const records = await resGet.json();
    expect(records.length).toBe(0);
  });
});
