/**
 * Project browser (home): hero, templates, recent projects with search/sort,
 * .kinema import (button + drag a file onto the window), first-run intro.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { HelpCircle, ArrowRight, FileUp, Folder, MousePointerClick, Moon, Plus, Search, Sparkles, Sun, Wand2, Zap } from 'lucide-react';
import { platform } from '@/platform';
import type { ProjectMeta } from '@/core/model/types';
import { useUI } from '@/core/store/uiStore';
import { Button, Dialog, IconButton, Segmented, TextInput } from '@/ui/primitives';
import { Wordmark } from '@/app/Logo';
import { toggleTheme } from '@/features/shortcuts/coreCommands';
import { TEMPLATES } from '@/core/templates';
import {
  createProjectFromTemplate,
  deleteProject,
  duplicateProject,
  exportProject,
  importKinemaBytes,
  importKinemaFromPicker,
  openProject,
  renameProject,
} from './projectService';
import { NewProjectDialog } from './NewProjectDialog';
import { ProjectCard, type ProjectCardActions } from './ProjectCard';
import { TemplatePreview } from './TemplatePreview';
import { Dropdown } from '@/ui/menu';
import { helpMenuItems } from '@/features/help/helpMenu';
import './home.css';

type Sort = 'recent' | 'name' | 'created';

const INTRO = [
  { icon: <MousePointerClick />, title: 'Design by dragging', text: 'Drop boxes, text and components on a real-DOM canvas. What you see is exactly what exports.' },
  { icon: <Zap />, title: 'Animation-first', text: 'Every layer has a timeline. Build entrance, hover and scroll animations without leaving the canvas.' },
  { icon: <Sparkles />, title: 'Local AI, private by default', text: 'Generate and edit layouts with a model running on your own machine. Your work never leaves it.' },
];

export function HomeScreen() {
  const theme = useUI((s) => s.theme);
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [dataPath, setDataPath] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newTpl, setNewTpl] = useState('blank');
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProjectMeta | null>(null);
  const [dropping, setDropping] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setProjects(await platform.projects.list());
    } catch (e) {
      toast.error('Could not load your projects', { description: String(e) });
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    platform.dataLocation().then(setDataPath, () => {});
  }, [refresh]);

  const openNew = (tpl = 'blank') => {
    setNewTpl(tpl);
    setNewOpen(true);
  };

  const create = async (name: string, templateId: string) => {
    setCreating(true);
    try {
      const id = await createProjectFromTemplate(name, templateId);
      setNewOpen(false);
      await openProject(id);
    } catch (e) {
      toast.error('Could not create project', { description: String(e) });
    } finally {
      setCreating(false);
    }
  };

  const importFiles = async (ids: string[]) => {
    await refresh();
    if (ids.length === 1) await openProject(ids[0]);
  };

  // Drag a .kinema file onto the window
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDropping(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDropping(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDropping(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      const pk = files.filter((f) => f.name.toLowerCase().endsWith('.kinema'));
      if (!pk.length) {
        toast.error('Drop a .kinema project file to import it');
        return;
      }
      const ids: string[] = [];
      for (const f of pk) {
        const id = await importKinemaBytes(new Uint8Array(await f.arrayBuffer()));
        if (id) ids.push(id);
      }
      await importFiles(ids);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actions: ProjectCardActions = useMemo(
    () => ({
      open: (p) => void openProject(p.id),
      rename: async (p, name) => {
        if (await renameProject(p.id, name)) void refresh();
      },
      duplicate: async (p) => {
        const id = await duplicateProject(p.id);
        if (id) {
          toast.success(`Duplicated “${p.name}”`);
          void refresh();
        }
      },
      export: (p) => void exportProject(p.id, p.thumbnail),
      remove: (p) => setDeleting(p),
    }),
    [refresh],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (projects ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
    list.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt));
    return list;
  }, [projects, query, sort]);

  const firstRun = projects !== null && projects.length === 0;

  return (
    <div className="k-home" data-first-run={firstRun ? 'true' : undefined}>
      <header className="k-home__bar k-drag-region">
        <Wordmark />
        <div className="k-home__bar-actions k-no-drag">
          <Button variant="ghost" size="sm" icon={<FileUp />} onClick={async () => importFiles(await importKinemaFromPicker())}>
            Import .kinema
          </Button>
          <Dropdown
            align="end"
            items={helpMenuItems()}
            trigger={
              <button className="k-iconbtn" aria-label="Help" data-tour="home-help">
                <HelpCircle />
              </button>
            }
          />
          <IconButton label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={toggleTheme} tooltipSide="bottom">
            {theme === 'dark' ? <Sun /> : <Moon />}
          </IconButton>
        </div>
      </header>

      <div className="k-home__scroll">
        <div className="k-home__inner">
          <section className="k-hero">
            <div className="k-hero__glow" aria-hidden />
            <p className="k-hero__eyebrow">
              <Wand2 /> {firstRun ? 'Welcome to Kinema' : 'Welcome back'}
            </p>
            <h1 className="k-hero__title">
              Design it. <span className="k-grad-text">Animate it.</span> Ship it.
            </h1>
            <p className="k-hero__sub">The animation-first visual designer for the web. Drag, drop and bring your layouts to life — all on your machine.</p>
            <div className="k-hero__cta">
              <Button variant="primary" size="lg" icon={<Plus />} onClick={() => openNew('blank')} data-testid="new-project">
                New project
              </Button>
              <Button variant="outline" size="lg" icon={<FileUp />} onClick={async () => importFiles(await importKinemaFromPicker())}>
                Import .kinema
              </Button>
            </div>
          </section>

          {firstRun && (
            <section className="k-intro" aria-label="What Kinema does">
              {INTRO.map((i) => (
                <div className="k-intro__card" key={i.title}>
                  <div className="k-intro__icon">{i.icon}</div>
                  <h3>{i.title}</h3>
                  <p>{i.text}</p>
                </div>
              ))}
            </section>
          )}

          <section className="k-home__section" aria-label="Start from template">
            <div className="k-home__head">
              <h2>Start from template</h2>
              <p>Polished, responsive and animated — ready to make your own.</p>
            </div>
            <div className="k-tpls">
              {TEMPLATES.filter((t) => t.id !== 'blank').map((t) => (
                <button key={t.id} className="k-tpl" data-template={t.id} onClick={() => openNew(t.id)}>
                  <TemplatePreview template={t} />
                  <span className="k-tpl__meta">
                    <span className="k-tpl__name">{t.name}</span>
                    <span className="k-tpl__desc">{t.description}</span>
                  </span>
                  <span className="k-tpl__go">
                    <ArrowRight />
                  </span>
                </button>
              ))}
            </div>
          </section>

          {!firstRun && (
            <section className="k-home__section" aria-label="Recent projects">
              <div className="k-home__head k-home__head--row">
                <div>
                  <h2>Recent projects</h2>
                  <p>{projects ? `${projects.length} project${projects.length === 1 ? '' : 's'}` : 'Loading…'}</p>
                </div>
                <div className="k-home__tools">
                  <TextInput wrapClassName="k-home__search" icon={<Search />} value={query} placeholder="Search projects" onChange={setQuery} aria-label="Search projects" />
                  <Segmented
                    value={sort}
                    onChange={setSort}
                    options={[
                      { value: 'recent', label: 'Recent' },
                      { value: 'name', label: 'Name' },
                      { value: 'created', label: 'Created' },
                    ]}
                  />
                </div>
              </div>
              {projects === null ? (
                <div className="k-pgrid">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="k-pcard k-pcard--skeleton" />
                  ))}
                </div>
              ) : visible.length === 0 ? (
                <div className="k-home__none">
                  <Folder />
                  <p>No projects match “{query}”.</p>
                </div>
              ) : (
                <div className="k-pgrid" data-testid="project-grid">
                  {visible.map((p, i) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      index={i}
                      actions={actions}
                      renaming={renamingId === p.id}
                      setRenaming={(v) => setRenamingId(v ? p.id : null)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          <footer className="k-home__foot">
            <span>Kinema</span>
            <span className="k-home__foot-sep" />
            <span title="Where your projects are stored">Your projects are stored in {dataPath || '…'}</span>
          </footer>
        </div>
      </div>

      <NewProjectDialog open={newOpen} initialTemplate={newTpl} busy={creating} onOpenChange={setNewOpen} onCreate={create} />

      <Dialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        width={420}
        title="Delete project?"
        description={deleting ? `“${deleting.name}” and its assets will be removed.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const p = deleting;
                setDeleting(null);
                if (p && (await deleteProject(p.id))) {
                  toast(`Deleted “${p.name}”`);
                  void refresh();
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />

      {dropping && (
        <div className="k-home__drop" aria-hidden>
          <div>
            <FileUp />
            <strong>Drop to import</strong>
            <span>Release a .kinema file to add it to your projects</span>
          </div>
        </div>
      )}
    </div>
  );
}
