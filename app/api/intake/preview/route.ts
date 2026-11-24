import { NextResponse } from 'next/server';
import { getBlueprintBySlug, previewIntakeMapping } from '@/lib/pipeline/run-intake';
import { buildChaoticExcelSampleBuffer } from '@/lib/demo/chaotic-sample';
import { extractValidatedMultipartFiles, parseSafeJson } from '@/lib/security/upload-guard';

export async function POST(request: Request): Promise<Response> {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const jsonRes = await parseSafeJson<{
        blueprintSlug?: string;
        simulateChaotic?: boolean;
        rawText?: string;
      }>(request);

      if (!jsonRes.ok) {
        return NextResponse.json({ error: jsonRes.error }, { status: 400 });
      }
      const body = jsonRes.data;
      const blueprintSlug = body.blueprintSlug || 'shopify-d2c-catalog';
      const blueprint = await getBlueprintBySlug(blueprintSlug);
      if (!blueprint) {
        return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
      }

      const preview = await previewIntakeMapping({
        blueprintSlug,
        spreadsheetBuffer: body.simulateChaotic
          ? buildChaoticExcelSampleBuffer(blueprint.targetType)
          : undefined,
        rawText: body.rawText,
      });

      return NextResponse.json({ preview, blueprint });
    }

    const formData = await request.formData();
    const blueprintSlug = String(formData.get('blueprintSlug') || 'shopify-d2c-catalog');
    const rawText = formData.get('rawText') ? String(formData.get('rawText')) : undefined;

    const blueprint = await getBlueprintBySlug(blueprintSlug);
    if (!blueprint) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }

    const validated = await extractValidatedMultipartFiles(formData);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const preview = await previewIntakeMapping({
      blueprintSlug,
      spreadsheetBuffer: validated.data.spreadsheetBuffer,
      rawText,
    });

    return NextResponse.json({ preview, blueprint });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Preview failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
