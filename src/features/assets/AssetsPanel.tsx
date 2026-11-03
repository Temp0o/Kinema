import { memo, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  AudioLines,
  Copy,
  CornerDownRight,
  FileQuestion,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  List,
  MousePointerClick,
  PenLine,
  Plus,
  Replace,
  Search,
  Trash2,
  Type as TypeIcon,
  Upload,
  Video as VideoIcon,
  Eraser,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AssetKind, KAsset } from '@/core/model/types';
import { useDoc, docApi } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { useAssetUrls, loadAssetUrls } from '@/core/assets/assetStore';
import { endDrag, startDrag } from '@/core/dnd';
import { insertionTarget } from '@/core/store/actions';
import { Button, Dialog, EmptyState, IconButton, Segmented, TextInput } from '@/ui/primitives';
import { ContextMenuArea, type MenuEntry } from '@/ui/menu';
import { computeAssetUsage, formatBytes } from './assetKinds';
import { assetNodeSize, insertAssets, nodeForAsset, pickedFromFiles, warmSvgCache, importFiles } from './importer';
import {
  copyAssetReference,
  deleteAsset,
  deleteOrphanFiles,
  findOrphanFiles,
  pickAndImport,
  renameAsset,
  replaceAssetFile,
  selectAssetUsers,
  useAssetsUI,
} from './assetActions';
import type { RegistryEntry } from './fileRegistry';
import './assets.css';

type ViewMode = 'grid' | 'list';
type KindFilter = 'all' | AssetKind;

const KIND_LABEL: Record<AssetKind, string> = { image: 'Images', svg: 'Vectors', font: 'Fonts', video: 'Video', audio: 'Audio', other: 'Other' };
const KIND_SINGULAR: Record<AssetKind, string> = { image: 'Image', svg: 'Vector', font: 'Font', video: 'Video', audio: 'Audio', other: 'File' };

function loadView(): ViewMode {
  try {
    return localStorage.getItem('kinema.assetsView') === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

// ─── Thumbnails ──────────────────────────────────────────────────────────────

function Thumb({ asset, url }: { asset: KAsset; url?: string }) {
  switch (asset.kind) {
    case 'image':
    case 'svg':
      return url ? <img className="k-asset__img" src={url} alt="" draggable={false} loading="lazy" /> : <span className="k-asset__ph" />;
    case 'video':
      return url ? <video className="k-asset__img" src={`${url}#t=0.1`} preload="metadata" muted playsInline /> : <span className="k-asset__ph"><VideoIcon /></span>;
    case 'font':
      return (
        <span
          className="k-asset__font"
          style={{ fontFamily: asset.fontFamily ? `'${asset.fontFamily}', var(--font-ui)` : undefined, fontWeight: asset.fontWeight?.includes(' ') ? 400 : asset.fontWeight, fontStyle: asset.fontStyle }}
        >
          Aa
        </span>
      );
    case 'audio':
      return <span className="k-asset__ph"><AudioLines /></span>;
    default:
      return <span className="k-asset__ph"><FileQuestion /></span>;
  }
}

function dimsLabel(a: KAsset): string {
  if (a.kind === 'font') return [a.fontFamily, a.fontWeight && !a.fontWeight.includes(' ') ? a.fontWeight : 'Variable', a.fontStyle === 'italic' ? 'Italic' : ''].filter(Boolean).join(' · ');
  if (a.width && a.height) return `${a.width} × ${a.height}`;
  return KIND_SINGULAR[a.kind];
}

// ─── Asset tile ──────────────────────────────────────────────────────────────

interface TileProps {
  asset: KAsset;
  url?: string;
  uses: number;
  mode: ViewMode;
  onDetails: (a: KAsset) => void;
  onRename: (a: KAsset) => void;
  onDelete: (a: KAsset) => void;
}

function insertOne(asset: KAsset) {
  if (asset.kind === 'font') {
    toast('Fonts are used from Typography', { description: `${asset.fontFamily ?? asset.name} is ready to pick in the font menus.` });
    return;
  }
  if (!insertionTarget()) return;
  insertAssets([asset]);
}

const AssetTile = memo(function AssetTile({ asset, url, uses, mode, onDetails, onRename, onDelete }: TileProps) {
  const draggable = asset.kind !== 'font' && asset.kind !== 'audio' && asset.kind !== 'other';
  const menu = (): MenuEntry[] => {
    const canInsert = draggable;
    return [
      { label: 'Insert', icon: <Plus />, disabled: !canInsert, onSelect: () => insertOne(asset) },
      { type: 'separator' },
      { label: 'Rename…', icon: <PenLine />, onSelect: () => onRename(asset) },
      { label: 'Replace file…', icon: <Replace />, onSelect: () => void replaceAssetFile(asset.id) },
      { label: 'Copy reference', icon: <Copy />, onSelect: () => void copyAssetReference(asset.id) },
      { label: 'Select layers using it', icon: <MousePointerClick />, disabled: uses === 0, onSelect: () => selectAssetUsers(asset.id) },
      { label: 'Details', icon: <Info />, onSelect: () => onDetails(asset) },
      { type: 'separator' },
      { label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => onDelete(asset) },
    ];
  };

  const onDragStart = (e: DragEvent) => {
    const probe = nodeForAsset(asset);
    if (!probe) {
      e.preventDefault();
      return;
    }
    const chip = document.createElement('div');
    chip.className = 'k-dragchip k-app';
    chip.textContent = asset.name;
    document.body.appendChild(chip);
    setTimeout(() => chip.remove(), 0);
    startDrag(
      e,
      {
        type: 'nodes',
        label: asset.name,
        size: assetNodeSize(probe),
        build: () => {
          const n = nodeForAsset(asset)!;
          return { rootId: n.id, nodes: { [n.id]: n } };
        },
      },
      chip,
    );
  };

  return (
    <ContextMenuArea items={menu}>
      <button
        type="button"
        className="k-asset"
        data-mode={mode}
        data-kind={asset.kind}
        data-asset={asset.id}
        draggable={draggable}
        aria-label={`${asset.name}, ${KIND_SINGULAR[asset.kind]}${uses ? `, used ${uses} time${uses > 1 ? 's' : ''}` : ', unused'}. ${draggable ? 'Click to insert.' : ''}`}
        title={draggable ? `${asset.name} — click to insert, or drag onto the canvas` : asset.name}
        onClick={() => insertOne(asset)}
        onDoubleClick={() => onDetails(asset)}
        onDragStart={onDragStart}
        onDragEnd={endDrag}
      >
        <span className="k-asset__thumb">
          <Thumb asset={asset} url={url} />
          {uses > 0 && (
            <span className="k-asset__uses" title={`Used in ${uses} layer${uses > 1 ? 's' : ''}`}>
              {uses}
            </span>
          )}
        </span>
        <span className="k-asset__meta">
          <span className="k-asset__name">{asset.name}</span>
          <span className="k-asset__sub">
            {dimsLabel(asset)}
            {mode === 'list' && ` · ${formatBytes(asset.size)}`}
          </span>
        </span>
        {mode === 'list' && <span className="k-asset__use-label">{uses ? `${uses} use${uses > 1 ? 's' : ''}` : 'Unused'}</span>}
      </button>
    </ContextMenuArea>
  );
});

// ─── Dialogs ─────────────────────────────────────────────────────────────────

function DetailsDialog({ asset, uses, url, onClose }: { asset: KAsset | null; uses: number; url?: string; onClose: () => void }) {
  const rows: [string, string][] = asset
    ? [
        ['Type', `${KIND_SINGULAR[asset.kind]} · ${asset.mime}`],
        ['File size', formatBytes(asset.size)],
        ...(asset.width && asset.height ? ([['Dimensions', `${asset.width} × ${asset.height} px`]] as [string, string][]) : []),
        ...(asset.kind === 'font' ? ([['Family', asset.fontFamily ?? '—'], ['Weight', asset.fontWeight ?? '400'], ['Style', asset.fontStyle ?? 'normal']] as [string, string][]) : []),
        ['Used by', uses ? `${uses} layer${uses > 1 ? 's' : ''}` : 'Not used'],
        ['Reference', `asset:${asset.id}`],
        ['Added', new Date(asset.createdAt).toLocaleString()],
      ]
    : [];
  return (
    <Dialog
      open={!!asset}
      onOpenChange={(o) => !o && onClose()}
      title={asset?.name ?? 'Details'}
      width={420}
      footer={
        asset && (
          <>
            <Button variant="outline" icon={<Replace />} onClick={() => void replaceAssetFile(asset.id)}>
              Replace file
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        )
      }
    >
      {asset && (
        <div className="k-asset-detail">
          <div className="k-asset-detail__preview">
            <Thumb asset={asset} url={url} />
          </div>
          <dl className="k-asset-detail__rows">
            {rows.map(([k, v]) => (
              <div key={k} className="k-asset-detail__row">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Dialog>
  );
}

function RenameDialog({ asset, onClose }: { asset: KAsset | null; onClose: () => void }) {
  const [name, setName] = useState('');
  useEffect(() => setName(asset?.name ?? ''), [asset]);
  const commit = () => {
    if (asset) renameAsset(asset.id, name);
    onClose();
  };
  return (
    <Dialog
      open={!!asset}
      onOpenChange={(o) => !o && onClose()}
      title="Rename asset"
      width={380}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={commit}>
            Rename
          </Button>
        </>
      }
    >
      <TextInput value={name} onChange={setName} autoFocus aria-label="Asset name" onKeyDown={(e) => e.key === 'Enter' && name.trim() && commit()} />
    </Dialog>
  );
}

function DeleteDialog({ asset, uses, onClose }: { asset: KAsset | null; uses: number; onClose: () => void }) {
  return (
    <Dialog
      open={!!asset}
      onOpenChange={(o) => !o && onClose()}
      title={`Delete “${asset?.name ?? ''}”?`}
      description={
        uses > 0
          ? `This asset is used by ${uses} layer${uses > 1 ? 's' : ''}. They will show a missing image until you restore it. You can undo this with ⌘Z.`
          : 'It will be removed from the project. You can undo this with ⌘Z.'
      }
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 />}
            onClick={() => {
              if (asset) deleteAsset(asset.id);
              onClose();
            }}
          >
            Delete
          </Button>
        </>
      }
    />
  );
}

function CleanupDialog() {
  const open = useAssetsUI((s) => s.cleanupOpen);
  const [files, setFiles] = useState<RegistryEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setFiles(null);
    void findOrphanFiles().then(setFiles);
  }, [open]);
  const close = () => useAssetsUI.getState().set({ cleanupOpen: false });
  const total = files?.reduce((n, f) => n + f.size, 0) ?? 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title="Clean up unused files"
      description={
        files == null
          ? 'Looking for files that no asset references…'
          : files.length
            ? `${files.length} file${files.length > 1 ? 's' : ''} (${formatBytes(total)}) are stored in this project but no longer used by any asset. Deleting them can’t be undone, and earlier undo steps that restored them will show missing files.`
            : 'Everything stored in this project is in use. Nothing to clean up.'
      }
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {files?.length ? 'Cancel' : 'Close'}
          </Button>
          {!!files?.length && (
            <Button
              variant="danger"
              icon={<Eraser />}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const n = await deleteOrphanFiles(files);
                setBusy(false);
                toast.success(`Deleted ${n} unused file${n === 1 ? '' : 's'}`);
                close();
              }}
            >
              Delete {files.length} file{files.length > 1 ? 's' : ''}
            </Button>
          )}
        </>
      }
    />
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function AssetsPanel() {
  const assetsMap = useDoc((s) => s.doc.assets);
  const nodes = useDoc((s) => s.doc.nodes);
  const projectId = useUI((s) => s.projectId);
  const urls = useAssetUrls((s) => s.urls);
  const [view, setView] = useState<ViewMode>(loadView);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [dropping, setDropping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<KAsset | null>(null);
  const [renaming, setRenaming] = useState<KAsset | null>(null);
  const [deleting, setDeleting] = useState<KAsset | null>(null);
  const dragDepth = useRef(0);

  const assets = useMemo(() => Object.values(assetsMap).sort((a, b) => b.createdAt - a.createdAt), [assetsMap]);
  const usage = useMemo(() => computeAssetUsage({ nodes, assets: assetsMap }), [nodes, assetsMap]);

  // Make sure URLs / SVG markup / registered fonts exist for what we show.
  useEffect(() => {
    if (!projectId) return;
    void loadAssetUrls(projectId, docApi.doc);
    void warmSvgCache(projectId, assets);
  }, [projectId, assets]);

  const kinds = useMemo(() => {
    const counts = new Map<AssetKind, number>();
    for (const a of assets) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [assets]);

  useEffect(() => {
    if (kind !== 'all' && !kinds.some(([k]) => k === kind)) setKind('all');
  }, [kinds, kind]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => (kind === 'all' || a.kind === kind) && (!q || a.name.toLowerCase().includes(q) || (a.fontFamily ?? '').toLowerCase().includes(q)));
  }, [assets, query, kind]);

  const setViewPersist = (v: ViewMode) => {
    setView(v);
    try {
      localStorage.setItem('kinema.assetsView', v);
    } catch {
      /* ignore */
    }
  };

  const doImport = async () => {
    setBusy(true);
    try {
      await pickAndImport();
    } finally {
      setBusy(false);
    }
  };

  const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current++;
    setDropping(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDropping(false);
  };
  const onDrop = async (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDropping(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    setBusy(true);
    try {
      const picked = await pickedFromFiles(files);
      const res = await importFiles(picked);
      if (res.length) toast.success(res.length === 1 ? `Imported ${res[0].name}` : `Imported ${res.length} assets`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="k-assets"
      data-dropping={dropping ? 'true' : undefined}
      onDragEnter={onDragEnter}
      onDragOver={(e) => hasFiles(e) && (e.preventDefault(), (e.dataTransfer.dropEffect = 'copy'))}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="k-assets__top">
        <div className="k-assets__row">
          <Button variant="primary" size="sm" icon={<Upload />} loading={busy} onClick={doImport} className="k-assets__import">
            Import
          </Button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextInput
              value={query}
              onChange={setQuery}
              icon={<Search />}
              placeholder="Search…"
              aria-label="Search assets"
              suffix={
                query ? (
                  <button type="button" className="k-iconbtn k-iconbtn--sm" aria-label="Clear search" onClick={() => setQuery('')}>
                    <X />
                  </button>
                ) : undefined
              }
            />
          </div>
          <Segmented<ViewMode>
            value={view}
            onChange={setViewPersist}
            options={[
              { value: 'grid', icon: <LayoutGrid />, tooltip: 'Grid view' },
              { value: 'list', icon: <List />, tooltip: 'List view' },
            ]}
          />
        </div>
        {assets.length > 0 && (
          <div className="k-ins__chips" role="group" aria-label="Filter by type">
            <button type="button" className="k-chip" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>
              All {assets.length}
            </button>
            {kinds.map(([k, n]) => (
              <button key={k} type="button" className="k-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {KIND_LABEL[k]} {n}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="k-assets__scroll">
        {assets.length === 0 ? (
          <div className="k-assets__empty">
            <EmptyState
              icon={<ImageIcon />}
              title="Bring in your assets"
              action={
                <Button variant="primary" icon={<Upload />} loading={busy} onClick={doImport}>
                  Import files
                </Button>
              }
            >
              Drop images, SVGs, fonts or video here, or browse your computer. Everything stays in this project.
            </EmptyState>
            <div className="k-assets__types">
              <span><ImageIcon /> PNG · JPG · WebP</span>
              <span><CornerDownRight /> SVG</span>
              <span><TypeIcon /> TTF · OTF · WOFF2</span>
              <span><VideoIcon /> MP4 · WebM</span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Search />} title="No matching assets">
            Nothing matches “{query || KIND_LABEL[kind as AssetKind]}”.
          </EmptyState>
        ) : (
          <div className="k-assets__grid" data-mode={view}>
            {filtered.map((a) => (
              <AssetTile
                key={a.id}
                asset={a}
                url={urls[a.id]}
                uses={usage.get(a.id)?.length ?? 0}
                mode={view}
                onDetails={setDetails}
                onRename={setRenaming}
                onDelete={(asset) => setDeleting(asset)}
              />
            ))}
          </div>
        )}
      </div>

      {assets.length > 0 && (
        <div className="k-assets__foot">
          <span>
            {assets.length} asset{assets.length > 1 ? 's' : ''} · {formatBytes(assets.reduce((n, a) => n + a.size, 0))}
          </span>
          <IconButton label="Clean up unused files" size="sm" onClick={() => useAssetsUI.getState().set({ cleanupOpen: true })}>
            <Eraser />
          </IconButton>
        </div>
      )}

      {dropping && (
        <div className="k-assets__drop" aria-hidden="true">
          <Upload />
          <strong>Drop to import</strong>
          <span>Images, SVGs, fonts and video</span>
        </div>
      )}

      <DetailsDialog asset={details ? assetsMap[details.id] ?? null : null} uses={details ? usage.get(details.id)?.length ?? 0 : 0} url={details ? urls[details.id] : undefined} onClose={() => setDetails(null)} />
      <RenameDialog asset={renaming ? assetsMap[renaming.id] ?? null : null} onClose={() => setRenaming(null)} />
      <DeleteDialog
        asset={deleting ? assetsMap[deleting.id] ?? null : null}
        uses={deleting ? usage.get(deleting.id)?.length ?? 0 : 0}
        onClose={() => setDeleting(null)}
      />
      <CleanupDialog />
    </div>
  );
}
