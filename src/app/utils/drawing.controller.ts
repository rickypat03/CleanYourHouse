
export interface DrawingControllerDeps {
  Konva: any;
  stage: any;
  layer: any;
  shapesRef: any[];
  minSize?: number;
  onCommit: (x: number, y: number, w: number, h: number) => Promise<void>;
}

export class DrawingController {

  private drawing = false;
  private draftGroup?: any;
  private startPos?: { x: number; y: number };

  constructor(private deps: DrawingControllerDeps) {}

  init() {

    const { stage } = this.deps;

    stage.on('dblclick.mapDrawing', () => {
      this.drawing = true;
    });

    stage.on('mousedown.mapDrawing', async (e: any) => {

      if (!this.drawing) return;
      if (e.target !== stage) return;

      const p = stage.getPointerPosition();
      if (!p) return;

      this.startPos = { x: p.x, y: p.y };
      this.draftGroup = this.makeDraft(p.x, p.y, 1, 1);
      this.deps.layer.add(this.draftGroup);
      this.deps.layer.draw();
    });

    stage.on('mousemove.mapDrawing', () => {

      if (!this.drawing || !this.draftGroup || !this.startPos) return;

      const p = stage.getPointerPosition();
      if (!p) return;

      const x = Math.min(this.startPos.x, p.x);
      const y = Math.min(this.startPos.y, p.y);
      const w = Math.max(1, Math.abs(p.x - this.startPos.x));
      const h = Math.max(1, Math.abs(p.y - this.startPos.y));
      this.updateDraft(x, y, w, h);
      this.deps.layer.batchDraw();
    });

    stage.on('mouseup.mapDrawing', async () => {

      if (!this.drawing || !this.draftGroup) return;

      const body = this.draftGroup.findOne('.body') as any;
      const x = this.draftGroup.x();
      const y = this.draftGroup.y();
      const w = body.width();
      const h = body.height();

      const minSize = this.deps.minSize ?? 16;
      const tooSmall = w < minSize || h < minSize;

      this.draftGroup.destroy();
      this.reset();

      if (tooSmall) {
        this.deps.layer.draw();
        return;
      }

      await this.deps.onCommit(x, y, w, h);
      this.deps.layer.draw();
    });
  }

  destroy() {
    const { stage } = this.deps;
    stage.off('dblclick.mapDrawing');
    stage.off('mousedown.mapDrawing');
    stage.off('mousemove.mapDrawing');
    stage.off('mouseup.mapDrawing');
  }

  /* ---------------- Draft ---------------- */

  private makeDraft(x: number, y: number, w: number, h: number) {

    const { Konva } = this.deps;
    const g = new Konva.Group({ x, y, listening: false });

    const body = new Konva.Rect({
      name: 'body',
      x: 0, y: 0, width: w, height: h,
      fill: '#93c5fd', opacity: 0.6,
      cornerRadius: 6, stroke: '#2563eb', dash: [6,4]
    });
    g.add(body);

    return g;
  }

  private updateDraft(x: number, y: number, w: number, h: number) {

    const g = this.draftGroup!;
    g.position({ x, y });
    const body = g.findOne('.body') as any;
    
    body.size({ width: w, height: h });
  }

  private reset() {
    this.drawing = false;
    this.draftGroup = undefined;
    this.startPos = undefined;
  }
}
