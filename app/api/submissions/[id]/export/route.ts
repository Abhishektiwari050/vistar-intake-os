import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { submissions } from '@/lib/db/schema';
import { getBlueprintBySlug } from '@/lib/pipeline/run-intake';
import { isValidUuid } from '@/lib/security/upload-guard';
import {
  compileAssetZipBuffer,
  compileCsvText,
  compileExcelBuffer,
  compileJsonExport,
  compileMarkdownSpec,
  compileSqlScript,
} from '@/lib/export/compilers';

function buildDispositionHeader(clientName: string, id: string, suffixWithExt: string): string {
  const normalized = clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const safeSlug = normalized.length > 0 ? normalized : `submission-${id.slice(0, 8)}`;
  const encodedClient = encodeURIComponent(clientName.replace(/[\r\n]/g, '') || safeSlug);
  return `attachment; filename="${safeSlug}-${suffixWithExt}"; filename*=UTF-8''${encodedClient}-${suffixWithExt}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await context.params;
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid submission UUID format' }, { status: 400 });
    }

    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'sql';
    const onlyVerified = url.searchParams.get('onlyVerified') !== 'false';

    const db = await getDb();
    const found = await db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
    if (!found.length) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const sub = found[0];
    const blueprint = await getBlueprintBySlug(sub.blueprintSlug);
    if (!blueprint) {
      return NextResponse.json({ error: 'Blueprint missing' }, { status: 404 });
    }

    if (format === 'sql') {
      const sqlText = compileSqlScript(sub.rows, blueprint, sub.assets, onlyVerified);
      return new Response(sqlText, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': buildDispositionHeader(sub.clientName, sub.id, 'verified.sql'),
        },
      });
    }

    if (format === 'md') {
      const mdText = compileMarkdownSpec(
        sub.rows,
        blueprint,
        sub.assets,
        sub.clientName,
        onlyVerified
      );
      return new Response(mdText, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': buildDispositionHeader(sub.clientName, sub.id, 'spec.md'),
        },
      });
    }

    if (format === 'csv') {
      const csvText = compileCsvText(sub.rows, blueprint, sub.assets, onlyVerified);
      return new Response(csvText, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': buildDispositionHeader(sub.clientName, sub.id, 'normalized.csv'),
        },
      });
    }

    if (format === 'json') {
      const jsonText = compileJsonExport(
        sub.rows,
        blueprint,
        sub.assets,
        sub.clientName,
        sub.id,
        onlyVerified
      );
      return new Response(jsonText, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': buildDispositionHeader(sub.clientName, sub.id, 'payload.json'),
        },
      });
    }

    if (format === 'xlsx') {
      const xlsxBuf = compileExcelBuffer(sub.rows, blueprint, sub.assets, onlyVerified);
      return new Response(new Uint8Array(xlsxBuf), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': buildDispositionHeader(sub.clientName, sub.id, 'normalized.xlsx'),
        },
      });
    }

    if (format === 'zip') {
      const zipBuf = await compileAssetZipBuffer(
        sub.rows,
        blueprint,
        sub.assets,
        sub.clientName,
        onlyVerified
      );
      return new Response(new Uint8Array(zipBuf), {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': buildDispositionHeader(sub.clientName, sub.id, 'assets.zip'),
        },
      });
    }

    return NextResponse.json({ error: `Unsupported export format: ${format}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed' },
      { status: 500 }
    );
  }
}
