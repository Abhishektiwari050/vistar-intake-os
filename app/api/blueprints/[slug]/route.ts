import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { blueprints } from '@/lib/db/schema';
import { parseSafeJson } from '@/lib/security/upload-guard';
import { UpdateBlueprintSchema } from '@/lib/validation/blueprint-schema';

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
): Promise<Response> {
  try {
    const { slug } = await context.params;
    const db = await getDb();
    const found = await db.select().from(blueprints).where(eq(blueprints.slug, slug)).limit(1);
    if (!found.length) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }
    return NextResponse.json({ blueprint: found[0] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch blueprint' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const jsonResult = await parseSafeJson(request);
  if (!jsonResult.ok) {
    return NextResponse.json({ error: jsonResult.error }, { status: 400 });
  }

  try {
    const { slug } = await context.params;
    const parsed = UpdateBlueprintSchema.safeParse(jsonResult.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = await getDb();
    const [updated] = await db
      .update(blueprints)
      .set(parsed.data)
      .where(eq(blueprints.slug, slug))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }
    return NextResponse.json({ blueprint: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update blueprint' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
): Promise<Response> {
  try {
    const { slug } = await context.params;
    const db = await getDb();
    const deleted = await db.delete(blueprints).where(eq(blueprints.slug, slug)).returning();
    if (!deleted.length) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, slug });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete blueprint' },
      { status: 500 }
    );
  }
}
