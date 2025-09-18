
import { collidesAnyGroup } from './geometry.util';

export interface TransformerOptions {
  rotateEnabled?: boolean;
  minSize?: number;
}

/**
 * Crea un Transformer riusabile con guardie (no-overlap + dentro stage).
 * Usa collidesAnyGroup per rifiutare boundBox "illegali".
 */
export function makeTransformer(
  Konva: any,
  stage: any,
  layer: any,
  shapesRef: any[],           // array dei Group attuali (mutabile)
  opts: TransformerOptions = {}
) {

  const {
    rotateEnabled = true,
    minSize = 16
  } = opts;

  const transformer = new Konva.Transformer({
    rotateEnabled,
    enabledAnchors: ['top-left','top-right','bottom-left','bottom-right'],
    ignoreStroke: true,
    padding: 6,
    anchorSize: 10,
  });

  transformer.boundBoxFunc((oldBox: any, newBox: any) => {
    
    const node = transformer.nodes()[0];
    if (!node) return oldBox;

    const w = Math.max(minSize, newBox.width);
    const h = Math.max(minSize, newBox.height);
    const nx = newBox.x;
    const ny = newBox.y;

    // 1) dentro stage?
    if (nx < 0 || ny < 0 || nx + w > stage.width() || ny + h > stage.height()) {
      return oldBox;
    }

    // 2) niente overlap?
    const body = node.findOne('.body') as any;
    const oldPos = node.position();
    const oldSize = { w: body.width(), h: body.height() };

    node.position({ x: nx, y: ny });
    body.size({ width: w, height: h });

    const collide = collidesAnyGroup(node, shapesRef, nx, ny);

    body.size({ width: oldSize.w, height: oldSize.h });
    node.position(oldPos);

    return collide ? oldBox : newBox;
  });

  layer.add(transformer);
  return transformer;
}
