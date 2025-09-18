
export interface SmartRectOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  cornerRadius?: number;
}

export interface SmartRectApi {
  group: any;              // Konva.Group
  body: any;               // Konva.Rect (name: 'body')
  hasAvatar(): boolean;
  setSize(w: number, h: number): void;
  recenterAvatar(): void;  // no-op se non c'è avatar
  setAvatar(url: string): Promise<void>; // crea avatarGroup on-demand
  removeAvatar(): void;    // rimuove avatar (torna allo stato "senza immagine")
}

/**
 * Crea un "smart rect" (Group + Rect .body). NIENTE immagine iniziale.
 * L’avatar è completamente opzionale e viene creato solo alla prima chiamata di setAvatar(url).
 */
export async function createSmartRect(Konva: any, opts: SmartRectOptions): Promise<SmartRectApi> {
  const { x, y, w, h, fill, cornerRadius = 6 } = opts;

  const group = new Konva.Group({ x, y, draggable: true });

  const body = new Konva.Rect({
    name: 'body',
    x: 0, y: 0,
    width: w, height: h,
    fill,
    cornerRadius,
    stroke: '#111',
    strokeWidth: 1,
  });
  group.add(body);

  // avatar lazily-created
  let avatarGroup: any | null = null;
  let imageNode: any | null = null;

  const ensureAvatarGroup = () => {
    if (avatarGroup) return;
    const r = Math.min(body.width(), body.height()) * 0.2;
    avatarGroup = new Konva.Group({
      name: 'avatar',
      x: body.width() / 2,
      y: body.height() / 2,
      offsetX: r, offsetY: r,
    });
    avatarGroup.clipFunc((ctx: CanvasRenderingContext2D) => {
      ctx.beginPath();
      ctx.arc(r, r, r, 0, Math.PI * 2);
    });
    imageNode = new Konva.Image({
      x: 0, y: 0, width: r * 2, height: r * 2,
    });
    avatarGroup.add(imageNode);
    group.add(avatarGroup);
  };

  const api: SmartRectApi = {
    group,
    body,
    hasAvatar: () => !!avatarGroup && !!imageNode && !!imageNode.image(),
    setSize: (newW: number, newH: number) => {
      body.size({ width: newW, height: newH });
      if (avatarGroup && imageNode) {
        const r = Math.min(newW, newH) * 0.2;
        avatarGroup.offset({ x: r, y: r });
        imageNode.size({ width: r * 2, height: r * 2 });
        avatarGroup.position({ x: newW / 2, y: newH / 2 });
      }
    },
    recenterAvatar: () => {
      if (!avatarGroup || !imageNode) return;
      const bw = body.width();
      const bh = body.height();
      const r = Math.min(bw, bh) * 0.2;
      avatarGroup.offset({ x: r, y: r });
      imageNode.size({ width: r * 2, height: r * 2 });
      avatarGroup.position({ x: bw / 2, y: bh / 2 });
    },
    setAvatar: async (url: string) => {
      ensureAvatarGroup();
      const img = await loadImage(url);
      imageNode!.image(img);
      // opzionale: api.recenterAvatar(); // già scalato; ricentriamo per sicurezza
      api.recenterAvatar();
      group.draw();
    },
    removeAvatar: () => {
      if (!avatarGroup) return;
      avatarGroup.destroy();
      avatarGroup = null;
      imageNode = null;
      group.draw();
    },
  };

  return api;
}

/* ------------ helpers locali ------------ */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
