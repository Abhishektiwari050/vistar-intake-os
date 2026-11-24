import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { submissions } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    const rows = await db
      .select({
        id: submissions.id,
        blueprintId: submissions.blueprintId,
        blueprintSlug: submissions.blueprintSlug,
        clientName: submissions.clientName,
        status: submissions.status,
        stats: submissions.stats,
        createdAt: submissions.createdAt,
      })
      .from(submissions)
      .orderBy(desc(submissions.createdAt))
      .limit(50);

    return NextResponse.json({ submissions: rows });
  } catch (err) {
    console.error('Failed to list submissions:', err);
    return NextResponse.json(
      { error: 'Failed to list submissions', submissions: [] },
      { status: 500 }
    );
  }
}
