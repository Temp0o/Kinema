import { customAlphabet } from 'nanoid';
import type {
  Breakpoint,
  DesignTokens,
  KDocument,
  KNode,
  NodeType,
  NodeProps,
  StyleMap,
  ProjectFile,
} from './types';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const nano = customAlphabet(alphabet, 10);

/** Short unique id. Prefix keeps ids readable in exported class names & debugging. */
export function uid(prefix = 'n'): string {
  return `${prefix}_${nano()}`;
}

export const DOC_VERSION = 1;

export const DEFAULT_BREAKPOINTS: Breakpoint[] = [
  { id: 'base', name: 'Desktop', width: 1440, icon: 'desktop' },
  { id: 'tablet', name: 'Tablet', maxWidth: 1024, width: 768, icon: 'tablet' },
  { id: 'mobile', name: 'Mobile', maxWidth: 640, width: 390, icon: 'mobile' },
];

export const DEFAULT_TOKENS: DesignTokens = {
  colors: [
    { id: 'c_primary', name: 'primary', value: '#7c5cff' },
    { id: 'c_accent', name: 'accent', value: '#22d3ee' },
    { id: 'c_text', name: 'text', value: '#0f1020' },
    { id: 'c_muted', name: 'muted', value: '#5b5f77' },
    { id: 'c_surface', name: 'surface', value: '#ffffff' },
    { id: 'c_bg', name: 'background', value: '#f6f6fb' },
  ],
  fonts: { heading: 'Inter Variable', body: 'Inter Variable', mono: 'JetBrains Mono Variable' },
  radius: 12,
  spacing: 8,
};

/** Default tag per node type (when node.tag is unset). */
export const DEFAULT_TAGS: Record<NodeType, string> = {
  frame: 'div',
  box: 'div',
  text: 'p',
  button: 'button',
  link: 'a',
  image: 'img',
  svg: 'div',
  input: 'input',
  textarea: 'textarea',
  select: 'select',
  video: 'video',
  instance: 'div',
};

/** Types that may contain children. */
export const CONTAINER_TYPES: ReadonlySet<NodeType> = new Set<NodeType>(['frame', 'box', 'button', 'link']);

export function isContainerType(type: NodeType): boolean {
  return CONTAINER_TYPES.has(type);
}

/** Node types whose `props.text` is rendered/edited as rich text. */
export const TEXT_TYPES: ReadonlySet<NodeType> = new Set<NodeType>(['text', 'button', 'link']);

const DEFAULT_NAMES: Record<NodeType, string> = {
  frame: 'Frame',
  box: 'Box',
  text: 'Text',
  button: 'Button',
  link: 'Link',
  image: 'Image',
  svg: 'Vector',
  input: 'Input',
  textarea: 'Text area',
  select: 'Select',
  video: 'Video',
  instance: 'Instance',
};

/** Sensible starting styles so freshly inserted nodes look good. */
export function defaultStyles(type: NodeType): StyleMap {
  switch (type) {
    case 'frame':
      return {
        position: 'relative',
        width: '100%',
        'min-height': '900px',
        'background-color': '#ffffff',
        overflow: 'hidden',
      };
    case 'box':
      return {
        width: '240px',
        height: '160px',
        'background-color': '#eef0ff',
        'border-radius': '12px',
      };
    case 'text':
      return {
        'font-size': '18px',
        'line-height': '1.5',
        color: '#0f1020',
      };
    case 'button':
      return {
        display: 'inline-flex',
        'align-items': 'center',
        'justify-content': 'center',
        gap: '8px',
        padding: '12px 22px',
        'background-color': '#7c5cff',
        color: '#ffffff',
        'font-size': '15px',
        'font-weight': '600',
        'border-radius': '10px',
        border: 'none',
        cursor: 'pointer',
      };
    case 'link':
      return { color: '#7c5cff', 'text-decoration': 'none', 'font-size': '16px' };
    case 'image':
      return {
        width: '320px',
        height: '200px',
        'object-fit': 'cover',
        'border-radius': '12px',
        display: 'block',
      };
    case 'svg':
      return { width: '96px', height: '96px', display: 'block' };
    case 'input':
    case 'select':
      return {
        width: '280px',
        padding: '12px 14px',
        'font-size': '15px',
        border: '1px solid #d4d6e4',
        'border-radius': '10px',
        'background-color': '#ffffff',
        color: '#0f1020',
      };
    case 'textarea':
      return {
        width: '320px',
        height: '120px',
        padding: '12px 14px',
        'font-size': '15px',
        border: '1px solid #d4d6e4',
        'border-radius': '10px',
        'background-color': '#ffffff',
        color: '#0f1020',
        resize: 'vertical',
      };
    case 'video':
      return { width: '480px', height: '270px', 'border-radius': '12px', display: 'block', 'background-color': '#000' };
    case 'instance':
      return {};
  }
}

function defaultProps(type: NodeType): NodeProps {
  switch (type) {
    case 'text':
      return { text: 'Text' };
    case 'button':
      return { text: 'Button' };
    case 'link':
      return { text: 'Link', href: '#' };
    case 'image':
      return { src: '', alt: '' };
    case 'input':
      return { inputType: 'text', placeholder: 'Type here…' };
    case 'textarea':
      return { placeholder: 'Write something…' };
    case 'select':
      return { options: ['Option one', 'Option two', 'Option three'] };
    case 'video':
      return { src: '', controls: true, muted: true };
    case 'svg':
      return {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3 7h7l-5.5 4.5 2 7.5L12 16.5 5.5 21l2-7.5L2 9h7z"/></svg>',
      };
    default:
      return {};
  }
}

export interface CreateNodeInit {
  name?: string;
  tag?: string;
  props?: NodeProps;
  styles?: StyleMap;
  /** Replace default styles instead of merging. */
  replaceStyles?: boolean;
  id?: string;
}

export function createNode(type: NodeType, init: CreateNodeInit = {}): KNode {
  const base = init.replaceStyles ? { ...(init.styles ?? {}) } : { ...defaultStyles(type), ...(init.styles ?? {}) };
  return {
    id: init.id ?? uid(),
    type,
    name: init.name ?? DEFAULT_NAMES[type],
    parent: null,
    children: [],
    tag: init.tag,
    props: { ...defaultProps(type), ...(init.props ?? {}) },
    styles: { base },
  };
}

export function createPage(name = 'Home'): { page: { id: string; name: string; rootId: string }; root: KNode } {
  const root = createNode('frame', { name });
  return { page: { id: uid('p'), name, rootId: root.id }, root };
}

export function createDocument(title = 'Untitled'): KDocument {
  const { page, root } = createPage('Home');
  return {
    version: DOC_VERSION,
    pages: [page],
    nodes: { [root.id]: root },
    components: {},
    assets: {},
    tokens: structuredClone(DEFAULT_TOKENS),
    breakpoints: structuredClone(DEFAULT_BREAKPOINTS),
    settings: { gridSize: 8, title },
  };
}

export function createProjectFile(name: string, document?: KDocument): ProjectFile {
  const now = Date.now();
  return {
    format: 'kinema-project',
    formatVersion: 1,
    id: uid('prj'),
    name,
    createdAt: now,
    updatedAt: now,
    document: document ?? createDocument(name),
  };
}

export function defaultNodeName(type: NodeType): string {
  return DEFAULT_NAMES[type];
}
