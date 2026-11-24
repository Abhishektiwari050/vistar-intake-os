'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Image as ImageIcon,
  Pencil,
  Search,
  RotateCcw,
  CheckCheck,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import type { Blueprint, NormalizedRow, ProcessedAsset } from '@/lib/types/intake';

type FilterTab = 'all' | 'errors' | 'healed' | 'verified';

interface DiffInspectorTableProps {
  blueprint: Blueprint;
  rows: NormalizedRow[];
  assets: ProcessedAsset[];
  onCellUpdate: (rowIndex: number, fieldKey: string, newValue: string) => Promise<void>;
  onCellRevert: (rowIndex: number, fieldKey: string) => Promise<void>;
  onApproveAllHealed: () => Promise<void>;
  onReassignAsset: (assetId: string, targetRowId: string | null) => Promise<void>;
  onApproveRows?: (rowIndices: number[]) => Promise<void>;
  onDeleteRows?: (rowIndices: number[]) => Promise<void>;
}

export function DiffInspectorTable({
  blueprint,
  rows,
  assets,
  onCellUpdate,
  onCellRevert,
  onApproveAllHealed,
  onReassignAsset,
  onApproveRows,
  onDeleteRows,
}: DiffInspectorTableProps) {
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; fieldKey: string } | null>(null);
  const [draftVal, setDraftVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [assetPickerRowId, setAssetPickerRowId] = useState<string | null>(null);

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [processingBatch, setProcessingBatch] = useState(false);
  const [isScrolledTop, setIsScrolledTop] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const validAssets = useMemo(
    () => assets.filter((a) => !a.isDuplicate && !a.error),
    [assets]
  );

  const assetByRowId = useMemo(() => {
    const map = new Map<string, ProcessedAsset>();
    for (const a of validAssets) {
      if (a.linkedRowId && !map.has(a.linkedRowId)) {
        map.set(a.linkedRowId, a);
      }
    }
    return map;
  }, [validAssets]);

  const counts = useMemo(() => {
    let errors = 0;
    let healed = 0;
    let verified = 0;
    let totalHealedCells = 0;

    for (const r of rows) {
      const cells = Object.values(r.cells);
      const hasHealed = cells.some((c) => c.status === 'ai_healed');
      totalHealedCells += cells.filter((c) => c.status === 'ai_healed').length;

      if (!r.isRowVerified) errors++;
      else verified++;
      if (hasHealed) healed++;
    }
    return { all: rows.length, errors, healed, verified, totalHealedCells };
  }, [rows]);

  const columnErrorCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const rule of blueprint.schemaRules) {
      map[rule.key] = rows.filter((r) => {
        const st = r.cells[rule.key]?.status;
        return st === 'missing_required' || st === 'invalid_format';
      }).length;
    }
    return map;
  }, [blueprint.schemaRules, rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterTab === 'errors' && r.isRowVerified) return false;
      if (filterTab === 'verified' && !r.isRowVerified) return false;
      if (filterTab === 'healed' && !Object.values(r.cells).some((c) => c.status === 'ai_healed')) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesText = Object.values(r.cells).some((c) =>
          String(c.value ?? '').toLowerCase().includes(q)
        );
        const asset = assetByRowId.get(r.rowId);
        const matchesAsset = asset?.healedFilename.toLowerCase().includes(q) ?? false;
        if (!matchesText && !matchesAsset) return false;
      }
      return true;
    });
  }, [rows, filterTab, searchQuery, assetByRowId]);

  const handleSave = useCallback(
    async (rowIndex: number, fieldKey: string) => {
      setSaving(true);
      try {
        await onCellUpdate(rowIndex, fieldKey, draftVal);
        setEditingCell(null);
      } finally {
        setSaving(false);
      }
    },
    [onCellUpdate, draftVal]
  );

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setIsScrolledTop(el.scrollTop > 4);
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll, filteredRows]);

  const selectedRowList = useMemo(() => {
    return filteredRows.filter((r) => rowSelection[r.rowId]);
  }, [filteredRows, rowSelection]);

  const selectedCount = selectedRowList.length;

  const handleBulkApproveSelected = async () => {
    if (selectedCount === 0 || processingBatch) return;
    setProcessingBatch(true);
    try {
      const selectedIndices = selectedRowList.map((r) => r.rowIndex);
      if (onApproveRows) {
        await onApproveRows(selectedIndices);
      } else {
        // Fallback: approve any healed cells in the selected rows using onCellUpdate
        for (const row of selectedRowList) {
          for (const [key, cell] of Object.entries(row.cells)) {
            if (cell.status === 'ai_healed') {
              await onCellUpdate(row.rowIndex, key, String(cell.value));
            }
          }
        }
      }
      setRowSelection({});
    } finally {
      setProcessingBatch(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedCount === 0 || processingBatch || !onDeleteRows) return;
    setProcessingBatch(true);
    try {
      const selectedIndices = selectedRowList.map((r) => r.rowIndex);
      await onDeleteRows(selectedIndices);
      setRowSelection({});
    } finally {
      setProcessingBatch(false);
    }
  };

  const columns = useMemo<ColumnDef<NormalizedRow>[]>(() => {
    const baseCols: ColumnDef<NormalizedRow>[] = [
      {
        id: 'select',
        header: ({ table }) => (
          <div className="flex items-center justify-center px-1">
            <input
              type="checkbox"
              checked={
                table.getIsAllPageRowsSelected() ||
                (table.getIsSomeRowsSelected() ? false : table.getIsAllRowsSelected())
              }
              ref={(el) => {
                if (el) el.indeterminate = table.getIsSomeRowsSelected();
              }}
              onChange={table.getToggleAllRowsSelectedHandler()}
              aria-label="Select all rows"
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center justify-center px-1">
            <input
              type="checkbox"
              checked={row.getIsSelected()}
              disabled={!row.getCanSelect()}
              onChange={row.getToggleSelectedHandler()}
              aria-label={`Select row ${row.original.rowIndex + 1}`}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          </div>
        ),
      },
      {
        id: 'status_col',
        header: 'Row Status',
        cell: ({ row }) => {
          const ok = row.original.isRowVerified;
          return ok ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-700">
              <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 font-mono text-[11px] font-medium text-rose-700">
              <XCircle className="h-3 w-3" strokeWidth={2} />
              Action Needed
            </span>
          );
        },
      },
      {
        id: 'asset_col',
        header: 'Linked Media',
        cell: ({ row }) => {
          const asset = assetByRowId.get(row.original.rowId);
          const isPicking = assetPickerRowId === row.original.rowId;

          if (isPicking) {
            return (
              <div className="min-w-[190px]">
                <select
                  autoFocus
                  value={asset?.id || ''}
                  onChange={async (e) => {
                    const selectedId = e.target.value;
                    if (selectedId) {
                      await onReassignAsset(selectedId, row.original.rowId);
                    } else if (asset) {
                      await onReassignAsset(asset.id, null);
                    }
                    setAssetPickerRowId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setAssetPickerRowId(null);
                    }
                  }}
                  onBlur={() => setAssetPickerRowId(null)}
                  className="w-full rounded border border-indigo-500 bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none"
                >
                  <option value="">-- Unlink Media --</option>
                  {validAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.healedFilename} ({a.originalFilename})
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (!asset) {
            return (
              <button
                type="button"
                onClick={() => setAssetPickerRowId(row.original.rowId)}
                disabled={validAssets.length === 0}
                className="flex items-center gap-1.5 rounded border border-dashed border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-400 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
              >
                <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {validAssets.length > 0 ? 'Assign Media' : 'Unlinked'}
              </button>
            );
          }

          return (
            <button
              type="button"
              onClick={() => setAssetPickerRowId(row.original.rowId)}
              title="Click to reassign or unlink image"
              className="group flex items-center gap-2.5 min-w-[180px] rounded p-1 text-left hover:bg-slate-50"
            >
              <img
                src={asset.dataUrl}
                alt={asset.healedFilename}
                className="h-9 w-9 rounded-md border border-slate-200 object-cover bg-white shrink-0"
              />
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-[11px] font-semibold text-slate-800 truncate group-hover:text-indigo-600">
                  {asset.healedFilename}
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  {asset.originalWidth}x{asset.originalHeight} → {asset.healedWidth}x{asset.healedHeight}
                </span>
              </div>
            </button>
          );
        },
      },
    ];

    for (const rule of blueprint.schemaRules) {
      const errCount = columnErrorCounts[rule.key] || 0;
      baseCols.push({
        id: rule.key,
        header: () => (
          <div className="flex items-center gap-1.5">
            <span>{rule.label}</span>
            {rule.required && <span className="text-rose-500">*</span>}
            {errCount > 0 && (
              <span className="rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-rose-700">
                {errCount} err
              </span>
            )}
          </div>
        ),
        cell: ({ row }) => {
          const cell = row.original.cells[rule.key];
          const isEditing =
            editingCell?.rowIndex === row.original.rowIndex && editingCell?.fieldKey === rule.key;

          if (isEditing) {
            return (
              <div className="flex flex-col gap-1 min-w-[170px]">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={draftVal}
                    onChange={(e) => setDraftVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSave(row.original.rowIndex, rule.key);
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingCell(null);
                      }
                    }}
                    autoFocus
                    disabled={saving}
                    className="w-full rounded border border-indigo-500 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleSave(row.original.rowIndex, rule.key)}
                    disabled={saving}
                    className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
                <span className="font-mono text-[9px] text-slate-400">↵ Enter save · Esc cancel</span>
              </div>
            );
          }

          if (!cell || cell.status === 'missing_required' || cell.status === 'invalid_format') {
            return (
              <button
                type="button"
                onClick={() => {
                  setEditingCell({ rowIndex: row.original.rowIndex, fieldKey: rule.key });
                  setDraftVal(
                    cell?.value !== null && cell?.value !== undefined ? String(cell.value) : ''
                  );
                }}
                title={cell?.reason || 'Click to resolve'}
                className="group flex w-full items-center justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-left transition-colors hover:border-rose-300"
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-rose-800">
                      {cell?.value !== null && cell?.value !== undefined ? String(cell.value) : 'Missing'}
                    </span>
                    <span className="rounded bg-rose-100 border border-rose-200 px-1 py-0.2 font-mono text-[9px] font-semibold text-rose-700">
                      {Math.round((cell?.confidence ?? 0) * 100)}% {cell?.status === 'missing_required' ? 'Missing' : 'Invalid'}
                    </span>
                  </div>
                  <span className="text-[10px] text-rose-600">{cell?.reason}</span>
                </div>
                <Pencil className="h-3 w-3 text-rose-500 opacity-70 group-hover:opacity-100 shrink-0" />
              </button>
            );
          }

          if (cell.status === 'ai_healed') {
            return (
              <div className="group relative flex w-full items-center justify-between gap-1.5 rounded-md border border-amber-200/90 bg-amber-50/40 px-2 py-1 text-left transition-colors hover:border-amber-300">
                <button
                  type="button"
                  onClick={() => {
                    setEditingCell({ rowIndex: row.original.rowIndex, fieldKey: rule.key });
                    setDraftVal(cell.value !== null ? String(cell.value) : '');
                  }}
                  className="flex items-center gap-1.5 text-left min-w-0 flex-1"
                >
                  <span className="font-mono text-xs font-semibold text-zinc-900 truncate">
                    {String(cell.value)}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" title={`Healed (${Math.round((cell.confidence ?? 0.96) * 100)}%)`} />
                </button>
                {cell.originalRaw !== null && (
                  <button
                    type="button"
                    onClick={() => onCellRevert(row.original.rowIndex, rule.key)}
                    title={`Revert to raw: "${cell.originalRaw}"`}
                    className="rounded p-0.5 text-amber-700 opacity-50 hover:bg-amber-100 hover:opacity-100 transition-opacity"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            );
          }

          return (
            <button
              type="button"
              onClick={() => {
                setEditingCell({ rowIndex: row.original.rowIndex, fieldKey: rule.key });
                setDraftVal(cell.value !== null ? String(cell.value) : '');
              }}
              className="group flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-slate-50"
            >
              <div className="flex flex-col text-left min-w-0">
                <span
                  className={`text-xs ${
                    rule.type === 'currency' || rule.type === 'number' || rule.type === 'sku'
                      ? 'font-mono tabular-nums font-medium text-slate-900'
                      : 'text-slate-700'
                  }`}
                >
                  {cell.value !== null ? String(cell.value) : '—'}
                </span>
                {cell && (
                  <span className="inline-flex items-center gap-1 font-mono text-[9px] text-emerald-600 mt-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {Math.round((cell.confidence ?? 1) * 100)}% Deterministic
                  </span>
                )}
              </div>
              <Pencil className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100 shrink-0" />
            </button>
          );
        },
      });
    }

    return baseCols;
  }, [
    blueprint.schemaRules,
    assetByRowId,
    assetPickerRowId,
    validAssets,
    columnErrorCounts,
    editingCell,
    draftVal,
    saving,
    handleSave,
    onCellRevert,
    onReassignAsset,
  ]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: {
      rowSelection,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.rowId,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        No tabular records extracted yet. Upload a spreadsheet or run a chaotic dry-run above.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      {/* Header & Filter Controls */}
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Schema Normalization &amp; Confidence Diff Audit
            </h3>
            <p className="text-xs text-slate-500">
              Click any cell to edit inline, hover amber diffs to revert, or assign linked product photos.
            </p>
          </div>

          {counts.totalHealedCells > 0 && (
            <button
              type="button"
              onClick={onApproveAllHealed}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Approve All Auto-Healed ({counts.totalHealedCells})
            </button>
          )}
        </div>

        {/* Batch Selection Toolbar */}
        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50/90 px-3.5 py-2 shadow-sm transition-all duration-200">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                {selectedCount}
              </span>
              <span className="text-xs font-semibold text-indigo-950">
                {selectedCount} {selectedCount === 1 ? 'row' : 'rows'} selected
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleBulkApproveSelected}
                disabled={processingBatch}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Bulk Approve Selected ({selectedCount})
              </button>
              {Boolean(onDeleteRows) && (
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={processingBatch}
                  className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Selected Rows ({selectedCount})
                </button>
              )}
              <button
                type="button"
                onClick={() => setRowSelection({})}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `All Rows (${counts.all})` },
                { id: 'errors', label: `Action Needed (${counts.errors})` },
                { id: 'healed', label: `Auto-Healed (${counts.healed})` },
                { id: 'verified', label: `Verified (${counts.verified})` },
              ] as Array<{ id: FilterTab; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-colors ${
                  filterTab === tab.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search SKU, title, email..."
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollContainerRef}
          onScroll={checkScroll}
          className="max-h-[600px] overflow-auto scroll-smooth"
        >
          <table className="w-full border-collapse text-left">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-slate-200">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className={`sticky top-0 z-10 whitespace-nowrap px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50/95 backdrop-blur-sm transition-shadow duration-150 ${
                        isScrolledTop ? 'shadow-sm border-b border-slate-300' : 'border-b border-slate-200'
                      }`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-xs text-slate-500">
                    No rows match the active filter or search query.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      row.getIsSelected() ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : 'hover:bg-slate-50/50'
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2.5 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {canScrollLeft && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white via-white/80 to-transparent z-15"
          />
        )}
        {canScrollRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-white via-white/80 to-transparent z-15 flex items-center justify-end pr-1 text-slate-400"
          >
            <ChevronRight className="h-4 w-4 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
