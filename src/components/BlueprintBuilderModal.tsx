'use client';

import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, Loader2, ShieldCheck } from 'lucide-react';
import type { Blueprint, FieldType, SchemaFieldRule } from '@/lib/types/intake';
import { ClientPortal } from './ClientPortal';

interface BlueprintBuilderModalProps {
  existingBlueprint?: Blueprint | null;
  onClose: () => void;
  onSaved: () => void;
}

const FIELD_TYPES: FieldType[] = ['string', 'number', 'currency', 'sku', 'email', 'gstin', 'url'];

export function BlueprintBuilderModal({
  existingBlueprint,
  onClose,
  onSaved,
}: BlueprintBuilderModalProps) {
  const isEditing = Boolean(existingBlueprint);

  const [name, setName] = useState(existingBlueprint?.name || '');
  const [slug, setSlug] = useState(existingBlueprint?.slug || '');
  const [description, setDescription] = useState(existingBlueprint?.description || '');
  const [targetType, setTargetType] = useState<'ecommerce_catalog' | 'agency_kickoff'>(
    existingBlueprint?.targetType || 'ecommerce_catalog'
  );
  const [sqlTableName, setSqlTableName] = useState(
    existingBlueprint?.sqlTableName || 'custom_intake_records'
  );
  const [schemaRules, setSchemaRules] = useState<SchemaFieldRule[]>(
    existingBlueprint?.schemaRules || [
      { key: 'sku', label: 'SKU Code', type: 'sku', required: true, aliases: ['sku', 'code', 'id'] },
      { key: 'title', label: 'Item Title', type: 'string', required: true, aliases: ['title', 'name'] },
      { key: 'price', label: 'Unit Price', type: 'currency', required: true, aliases: ['price', 'rate'] },
    ]
  );

  const [targetWidth, setTargetWidth] = useState(existingBlueprint?.mediaRules.targetWidth || 1080);
  const [targetHeight, setTargetHeight] = useState(existingBlueprint?.mediaRules.targetHeight || 1080);
  const [outputFormat, setOutputFormat] = useState<'webp' | 'png'>(
    existingBlueprint?.mediaRules.outputFormat || 'webp'
  );
  const [deduplicateByHash, setDeduplicateByHash] = useState(
    existingBlueprint?.mediaRules.deduplicateByHash ?? true
  );
  const [autoHealOffRatio, setAutoHealOffRatio] = useState(
    existingBlueprint?.mediaRules.autoHealOffRatio ?? true
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isEditing) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 48)
      );
      setSqlTableName(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .replace(/^[0-9]+/, 'tbl_')
          .slice(0, 48) || 'custom_records'
      );
    }
  };

  const addField = () => {
    setSchemaRules((prev) => [
      ...prev,
      {
        key: `field_${prev.length + 1}`,
        label: `Custom Field ${prev.length + 1}`,
        type: 'string',
        required: false,
        aliases: [],
      },
    ]);
  };

  const updateField = (idx: number, patch: Partial<SchemaFieldRule>) => {
    setSchemaRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeField = (idx: number) => {
    if (schemaRules.length <= 1) return;
    setSchemaRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim(),
        targetType,
        sqlTableName: sqlTableName.trim(),
        schemaRules: schemaRules.map((r) => ({
          ...r,
          key: r.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          label: r.label.trim(),
          aliases: r.aliases.map((a) => a.trim()).filter(Boolean),
        })),
        mediaRules: {
          minWidth: 512,
          minHeight: 512,
          targetWidth: Number(targetWidth),
          targetHeight: Number(targetHeight),
          aspectRatio: Number(targetWidth) === Number(targetHeight) ? ('1:1' as const) : ('any' as const),
          outputFormat,
          deduplicateByHash,
          autoHealOffRatio,
        },
      };

      const url = isEditing ? `/api/blueprints/${existingBlueprint!.slug}` : '/api/blueprints';
      const method = isEditing ? 'PATCH' : 'POST';

      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to save blueprint');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ClientPortal lockScroll={true}>
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-md p-4 animate-fade-in"
      >
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-3xl border border-white/80 bg-white/95 backdrop-blur-2xl shadow-2xl overflow-hidden">
          {/* Sticky Header */}
          <div className="flex items-center justify-between border-b border-black/[0.06] bg-white/80 px-6 py-4 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-950 text-white shadow-xs">
                <ShieldCheck className="h-4 w-4" strokeWidth={2} />
              </div>
              <h2 className="text-sm font-bold tracking-tight text-zinc-900 font-display">
                {isEditing ? `Edit Blueprint: ${existingBlueprint?.name}` : 'Create Custom Intake Blueprint'}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="rounded-full p-1.5 text-zinc-400 hover:bg-black/5 hover:text-zinc-800 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            {/* Scrollable Body */}
            <div className="overflow-y-auto p-6 space-y-5 flex-1 max-h-[calc(90vh-140px)]">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Blueprint Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Automotive Parts Intake"
                className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white/70 px-3.5 py-2 text-xs text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Magic Link Slug
              </label>
              <input
                type="text"
                required
                disabled={isEditing}
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="auto-parts-intake"
                className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white/40 px-3.5 py-2 font-mono text-xs text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none disabled:opacity-60 transition-colors"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Target PostgreSQL Table
              </label>
              <input
                type="text"
                required
                value={sqlTableName}
                onChange={(e) => setSqlTableName(e.target.value)}
                placeholder="auto_parts_catalog"
                className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white/70 px-3.5 py-2 font-mono text-xs text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Workflow Preset
              </label>
              <select
                value={targetType}
                onChange={(e) =>
                  setTargetType(e.target.value as 'ecommerce_catalog' | 'agency_kickoff')
                }
                className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white/70 px-3.5 py-2 text-xs text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none transition-colors"
              >
                <option value="ecommerce_catalog">Product &amp; Inventory Catalog</option>
                <option value="agency_kickoff">Service / Agency Project Spec</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Description (Shown to Clients on Dropzone)
            </label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Upload supplier part spreadsheets and product photos for instant validation."
              className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white/70 px-3.5 py-2 text-xs text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none transition-colors"
            />
          </div>

          {/* Schema Field Rules */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Schema Field Rules ({schemaRules.length})
              </span>
              <button
                type="button"
                onClick={addField}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white/80 px-3 py-1 font-mono text-[11px] font-medium text-zinc-800 hover:bg-white transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add Column Rule
              </button>
            </div>

            <div className="space-y-2">
              {schemaRules.map((rule, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 items-center gap-2 rounded-2xl border border-black/[0.06] bg-white/60 p-3 shadow-xs"
                >
                  <input
                    type="text"
                    value={rule.key}
                    onChange={(e) => updateField(idx, { key: e.target.value })}
                    placeholder="sql_key"
                    className="col-span-3 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 font-mono text-[11px] text-zinc-900 focus:border-zinc-900 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={rule.label}
                    onChange={(e) => updateField(idx, { label: e.target.value })}
                    placeholder="Display Label"
                    className="col-span-3 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-[11px] text-zinc-900 focus:border-zinc-900 focus:outline-none"
                  />
                  <select
                    value={rule.type}
                    onChange={(e) => updateField(idx, { type: e.target.value as FieldType })}
                    className="col-span-2 rounded-lg border border-black/[0.08] bg-white px-2 py-1.5 font-mono text-[11px] text-zinc-900 focus:border-zinc-900 focus:outline-none"
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={rule.aliases.join(', ')}
                    onChange={(e) =>
                      updateField(idx, { aliases: e.target.value.split(',') })
                    }
                    placeholder="alias1, alias2"
                    title="Comma-separated header aliases"
                    className="col-span-2 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 font-mono text-[11px] text-zinc-700 focus:border-zinc-900 focus:outline-none"
                  />
                  <label className="col-span-1 flex items-center justify-center gap-1.5 text-[10px] font-medium text-zinc-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule.required}
                      onChange={(e) => updateField(idx, { required: e.target.checked })}
                      className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                    />
                    Req
                  </label>
                  <button
                    type="button"
                    onClick={() => removeField(idx)}
                    disabled={schemaRules.length <= 1}
                    aria-label="Remove rule"
                    className="col-span-1 flex justify-center text-zinc-400 hover:text-rose-600 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Media Healing Rules */}
          <div className="rounded-2xl border border-black/[0.06] bg-white/60 p-4">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-3">
              Media Auto-Healing &amp; Deduplication Rules
            </span>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-[11px] text-zinc-600 font-medium">Target Width (px)</label>
                <input
                  type="number"
                  value={targetWidth}
                  onChange={(e) => setTargetWidth(Number(e.target.value))}
                  min={256}
                  max={4096}
                  className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-1.5 font-mono text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-600 font-medium">Target Height (px)</label>
                <input
                  type="number"
                  value={targetHeight}
                  onChange={(e) => setTargetHeight(Number(e.target.value))}
                  min={256}
                  max={4096}
                  className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-1.5 font-mono text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-600 font-medium">Format</label>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value as 'webp' | 'png')}
                  className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-1.5 font-mono text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
                >
                  <option value="webp">WebP</option>
                  <option value="png">PNG</option>
                </select>
              </div>
              <div className="flex flex-col justify-end gap-2 text-[11px] text-zinc-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deduplicateByHash}
                    onChange={(e) => setDeduplicateByHash(e.target.checked)}
                    className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  dHash Deduplication
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoHealOffRatio}
                    onChange={(e) => setAutoHealOffRatio(e.target.checked)}
                    className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  Auto-Pad Ratio
                </label>
              </div>
            </div>
          </div>

              {error && (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-800">
                  {error}
                </div>
              )}
            </div>

            {/* Sticky Action Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-black/[0.08] bg-white/95 backdrop-blur-md px-6 py-4 shrink-0 shadow-xs">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-black/10 bg-white/80 px-5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-6 py-2 text-xs font-semibold text-white shadow-sm hover:bg-black active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Create Blueprint'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ClientPortal>
  );
}
