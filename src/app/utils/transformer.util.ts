// utils/transformer.util.ts
export interface TransformerOptions {
  rotateEnabled?: boolean;
  minSize?: number;
  snapPx?: number; // usato dal chiamante (post-transformend), qui non snappiamo
}

export function makeTransformer(
  Konva: any,
  stage: any,
  layer: any,
  _shapesRef: any[],
  opts: TransformerOptions = {}
) {
  const { rotateEnabled = true, minSize = 16 } = opts;

  const transformer = new Konva.Transformer({
    rotateEnabled,
    enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    ignoreStroke: true,
    padding: 0,
    anchorSize: 10,
    rotationSnaps: [0, 90, 180, 270],
    rotationSnapTolerance: 6,
  });

  transformer.boundBoxFunc((oldBox: any, newBox: any) => {
    // Se è rotazione, non interferire
    const active = (transformer as any).getActiveAnchor?.();
    if (active === 'rotater') return newBox;

    // Solo clamp minima size; niente snap/collision qui.
    const w = Math.max(minSize, newBox.width);
    const h = Math.max(minSize, newBox.height);
    return { ...newBox, width: w, height: h };
  });

  layer.add(transformer);
  return transformer;
}
