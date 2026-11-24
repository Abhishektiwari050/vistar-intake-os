import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { mappingMemory } from '@/lib/db/schema';
import { isValidUuid } from '@/lib/security/upload-guard';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await context.params;

    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid mapping memory UUID format' }, { status: 400 });
    }

    const db = await getDb();
    const deleted = await db
      .delete(mappingMemory)
      .where(eq(mappingMemory.id, id))
      .returning();

    if (!deleted.length) {
      return NextResponse.json({ error: 'Mapping memory entry not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedId: id }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete mapping memory entry' },
      { status: 500 }
    );
  }
}
