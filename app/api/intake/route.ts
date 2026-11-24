import { NextResponse } from 'next/server';
import { getBlueprintBySlug, runIntakePipeline } from '@/lib/pipeline/run-intake';
import {
  buildChaoticExcelSampleBuffer,
  buildChaoticMediaSampleAssets,
} from '@/lib/demo/chaotic-sample';
import {
  extractValidatedMultipartFiles,
  parseSafeJson,
} from '@/lib/security/upload-guard';

export async function POST(request: Request): Promise<Response> {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Mode A: JSON Simulation or Raw Text Ingestion
    if (contentType.includes('application/json')) {
      const jsonRes = await parseSafeJson<{
        blueprintSlug?: string;
        clientName?: string;
        simulateChaotic?: boolean;
        rawText?: string;
        columnMappingOverride?: Record<string, string>;
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

      if (body.simulateChaotic) {
        const excelBuffer = buildChaoticExcelSampleBuffer(blueprint.targetType);
        const mediaAssets = await buildChaoticMediaSampleAssets(blueprint.targetType);

        const submission = await runIntakePipeline({
          blueprintSlug,
          clientName: body.clientName?.trim() || 'Chaotic Sandbox Client',
          spreadsheetBuffer: excelBuffer,
          mediaAssets,
          columnMappingOverride: body.columnMappingOverride,
        });

        return NextResponse.json({ submission, blueprint }, { status: 201 });
      }

      if (!body.rawText?.trim()) {
        return NextResponse.json(
          { error: 'Either rawText or simulateChaotic=true must be provided' },
          { status: 400 }
        );
      }

      const submission = await runIntakePipeline({
        blueprintSlug,
        clientName: body.clientName?.trim() || 'Direct Text Intake',
        rawText: body.rawText,
        columnMappingOverride: body.columnMappingOverride,
      });

      return NextResponse.json({ submission, blueprint }, { status: 201 });
    }

    // Mode B: Multipart File Dropzone Ingestion (Strict file limits + magic-byte checks)
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid multipart form payload' }, { status: 400 });
    }

    const blueprintSlug = String(formData.get('blueprintSlug') || 'shopify-d2c-catalog');
    const clientName = String(formData.get('clientName') || 'Client Dropzone Submission').trim();
    const rawText = formData.get('rawText') ? String(formData.get('rawText')) : undefined;

    let columnMappingOverride: Record<string, string> | undefined;
    const rawOverride = formData.get('columnMappingOverride');
    if (rawOverride && typeof rawOverride === 'string') {
      try {
        columnMappingOverride = JSON.parse(rawOverride) as Record<string, string>;
      } catch {
        return NextResponse.json({ error: 'Invalid columnMappingOverride JSON' }, { status: 400 });
      }
    }

    const blueprint = await getBlueprintBySlug(blueprintSlug);
    if (!blueprint) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }

    const validated = await extractValidatedMultipartFiles(formData);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const { spreadsheetBuffer, mediaAssets } = validated.data;
    if (!spreadsheetBuffer && !rawText?.trim() && mediaAssets.length === 0) {
      return NextResponse.json(
        { error: 'Please upload a spreadsheet (.xlsx/.csv), raw text, or product images.' },
        { status: 400 }
      );
    }

    const submission = await runIntakePipeline({
      blueprintSlug,
      clientName,
      spreadsheetBuffer,
      rawText,
      mediaAssets,
      columnMappingOverride,
    });

    return NextResponse.json({ submission, blueprint }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Intake processing failed';
    const isClientError = /corrupted|unreadable|empty|no readable sheets/i.test(message);
    return NextResponse.json({ error: message }, { status: isClientError ? 400 : 500 });
  }
}
