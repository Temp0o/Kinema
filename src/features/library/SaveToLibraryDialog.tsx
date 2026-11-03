import { useEffect, useState } from 'react';
import { BookMarked, FolderPlus, X } from 'lucide-react';
import { Button, Dialog, Segmented, Select, TextInput } from '@/ui/primitives';
import type { LibraryItemKind } from '@/core/model/types';
import { createFolder, KIND_LABEL, useLibrary, useSaveDialog } from './libraryStore';

const NONE = '__none__';
const NEW = '__new__';

/** Comma/Enter separated tag chips. */
export function TagsEditor({ tags, onChange, suggestions = [] }: { tags: string[]; onChange: (t: string[]) => void; suggestions?: string[] }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const next = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (next.length) onChange([...new Set([...tags, ...next])]);
    setText('');
  };
  const sugg = suggestions.filter((s) => !tags.includes(s) && s.toLowerCase().includes(text.toLowerCase())).slice(0, 5);
  return (
    <div className="k-tags">
      <div className="k-tags__list">
        {tags.map((t) => (
          <span key={t} className="k-tag">
            {t}
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
              <X />
            </button>
          </span>
        ))}
      </div>
      <TextInput
        value={text}
        placeholder="Add tags — press Enter"
        onChange={(v) => (v.endsWith(',') ? add(v) : setText(v))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text.trim()) {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => text.trim() && add(text)}
      />
      {sugg.length > 0 && (
        <div className="k-tags__sugg">
          {sugg.map((s) => (
            <button key={s} type="button" className="k-tag k-tag--ghost" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderPicker({ value, onChange }: { value: string | undefined; onChange: (f: string | undefined) => void }) {
  const folders = useLibrary((s) => s.folders);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  if (creating)
    return (
      <div className="k-hstack">
        <TextInput
          wrapClassName="k-grow"
          autoFocus
          value={name}
          placeholder="New folder name"
          onChange={setName}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) {
              const f = createFolder(name);
              if (f) onChange(f);
              setCreating(false);
              setName('');
            } else if (e.key === 'Escape') {
              setCreating(false);
              e.stopPropagation();
            }
          }}
        />
        <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
          Cancel
        </Button>
      </div>
    );
  return (
    <Select
      ariaLabel="Folder"
      value={value ?? NONE}
      onChange={(v) => (v === NEW ? setCreating(true) : onChange(v === NONE ? undefined : v))}
      options={[
        { value: NONE, label: 'No folder' },
        ...folders.map((f) => ({ value: f, label: f })),
        { value: NEW, label: 'New folder…', icon: <FolderPlus /> },
      ]}
    />
  );
}

export function SaveToLibraryDialog() {
  const request = useSaveDialog((s) => s.request);
  const close = useSaveDialog((s) => s.close);
  const items = useLibrary((s) => s.items);
  const [name, setName] = useState('');
  const [folder, setFolder] = useState<string | undefined>();
  const [tags, setTags] = useState<string[]>([]);
  const [kind, setKind] = useState<LibraryItemKind>('component');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (request) {
      setName(request.defaultName);
      setFolder(request.defaultFolder);
      setTags([]);
      setKind(request.kind);
      setBusy(false);
    }
  }, [request]);

  const submit = async () => {
    if (!request || busy) return;
    setBusy(true);
    try {
      await request.create(kind, { name: name.trim() || request.defaultName, folder, tags });
      close();
    } finally {
      setBusy(false);
    }
  };

  const allTags = [...new Set(items.flatMap((i) => i.tags))];
  return (
    <Dialog
      open={!!request}
      onOpenChange={(v) => !v && close()}
      width={440}
      title={request?.title ?? 'Save to library'}
      description="Saved items are available in every project."
      icon={<BookMarked style={{ width: 20, height: 20, color: 'var(--accent-text)', marginTop: 2 }} />}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit} data-testid="save-library-confirm">
            Save
          </Button>
        </>
      }
    >
      {request && (
        <div className="k-stack" style={{ gap: 12 }}>
          {request.kinds && <Segmented value={kind} onChange={setKind} options={request.kinds.map((k) => ({ value: k.kind, label: k.label }))} />}
          <div className="k-stack">
            <span className="k-label">Name</span>
            <TextInput
              autoFocus
              value={name}
              placeholder={KIND_LABEL[kind]}
              onChange={setName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
              aria-label="Name"
            />
          </div>
          <div className="k-stack">
            <span className="k-label">Folder</span>
            <FolderPicker value={folder} onChange={setFolder} />
          </div>
          <div className="k-stack">
            <span className="k-label">Tags</span>
            <TagsEditor tags={tags} onChange={setTags} suggestions={allTags} />
          </div>
        </div>
      )}
    </Dialog>
  );
}
