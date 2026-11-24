import { NextResponse } from 'next/server';
import { desc, count, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { blueprints, mappingMemory, submissions, webhooks } from '@/lib/db/schema';
import { parseSafeJson } from '@/lib/security/upload-guard';
import { BlueprintSchema } from '@/lib/validation/blueprint-schema';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    const allBlueprints = await db.select().from(blueprints).orderBy(desc(blueprints.createdAt));
    const recentSubmissions = await db
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
      .limit(25);

    const [{ value: memoryCount }] = await db.select({ value: count() }).from(mappingMemory);
    const allWebhooks = await db.select().from(webhooks).orderBy(desc(webhooks.createdAt));

    return NextResponse.json({
      blueprints: allBlueprints,
      submissions: recentSubmissions,
      mappingMemoryCount: Number(memoryCount),
      webhooks: allWebhooks,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load blueprints' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const jsonResult = await parseSafeJson(request);
  if (!jsonResult.ok) {
    return NextResponse.json({ error: jsonResult.error }, { status: 400 });
  }

  try {
    const parsed = BlueprintSchema.safeParse(jsonResult.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = await getDb();
    const existing = await db
      .select({ id: blueprints.id })
      .from(blueprints)
      .where(eq(blueprints.slug, parsed.data.slug))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: `A blueprint with slug "${parsed.data.slug}" already exists.` },
        { status: 409 }
      );
    }

    const [created] = await db.insert(blueprints).values(parsed.data).returning();
    return NextResponse.json({ blueprint: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create blueprint' },
      { status: 500 }
    );
  }
}
