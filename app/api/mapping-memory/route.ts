import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { blueprints, mappingMemory } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const db = await getDb();

    const records = await db
      .select({
        id: mappingMemory.id,
        blueprintId: mappingMemory.blueprintId,
        blueprintTitle: blueprints.name,
        blueprintName: blueprints.name,
        blueprintSlug: blueprints.slug,
        headerHash: mappingMemory.headerHash,
        mappingJson: mappingMemory.mappingJson,
        hitCount: mappingMemory.hitCount,
        createdAt: mappingMemory.createdAt,
      })
      .from(mappingMemory)
      .leftJoin(blueprints, eq(mappingMemory.blueprintId, blueprints.id))
      .orderBy(desc(mappingMemory.createdAt));

    const formatted = records.map((r) => ({
      id: r.id,
      blueprintId: r.blueprintId,
      blueprintTitle: r.blueprintTitle ?? r.blueprintName ?? 'Custom Blueprint',
      blueprintName: r.blueprintName ?? r.blueprintTitle ?? 'Custom Blueprint',
      blueprintSlug: r.blueprintSlug ?? 'unknown',
      headerHash: r.headerHash,
      mappingJson: r.mappingJson ?? {},
      hitCount: r.hitCount,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));

    return NextResponse.json(formatted);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch mapping memory records' },
      { status: 500 }
    );
  }
}
