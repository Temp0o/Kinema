/**
 * Asset import API (owned by the assets module). Other modules (canvas file drops,
 * paste handling, AI) call these functions.
 */
import type { KAsset, KNode, NodeId } from '@/core/model/types';
import type { PickedFile } from '@/platform';

export interface ImportedAsset {
  asset: KAsset;
}

/** Import files into the current project (writes binaries + registers KAssets in the doc). */
export async function importFiles(_files: PickedFile[]): Promise<KAsset[]> {
  return [];
}

/** Build a node for an asset (image node, editable svg node, video node). Fonts return null. */
export function nodeForAsset(_asset: KAsset): KNode | null {
  return null;
}

/**
 * Import OS files and insert them into `parentId`. `point` (px, relative to the
 * parent's border box) positions them when the parent is freeform.
 */
export async function importAndInsertFiles(_files: PickedFile[], _parentId: NodeId, _point?: { x: number; y: number }): Promise<NodeId[]> {
  return [];
}
