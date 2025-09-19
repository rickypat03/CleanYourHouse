import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';

import { createSmartRect } from '../../../utils/smart-rect.factory';
import {
  getClientRectAt,
  collidesAnyGroup,
  findSnapToEdgesGroupRotated,
} from '../../../utils/geometry.util';
import { makeTransformer } from '../../../utils/transformer.util';
import { DrawingController } from '../../../utils/drawing.controller';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
})
export class MapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('stageHost', { static: true }) host!: ElementRef<HTMLDivElement>;

  public isBrowser: boolean;

  private Konva!: any;
  private stage!: any;
  private layer!: any;
  private transformer!: any;

  private shapes: any[] = [];
  private resizeObs?: ResizeObserver;

  private readonly SNAP = 8;
  private readonly MIN_SIZE = 16;

  private drawingCtl?: DrawingController;

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  async ngAfterViewInit(): Promise<void> {
    if (!this.isBrowser) return;

    const mod = await import('konva');
    this.Konva = mod.default;

    const { w, h } = await this.ensureHostSize();

    this.stage = new this.Konva.Stage({
      container: this.host.nativeElement,
      width: w,
      height: h,
    });
    this.layer = new this.Konva.Layer();
    this.stage.add(this.layer);

    this.transformer = makeTransformer(this.Konva, this.stage, this.layer, this.shapes, {
      rotateEnabled: true,
      minSize: this.MIN_SIZE,
      snapPx: this.SNAP, // usato post-transformend
    });

    // click su stage = deselezione
    this.stage.on('mousedown', (e: any) => {
      if (e.target === this.stage) this.attachTransformerTo(null);
    });

    // factory per dragBound
    const applyDragBound = (group: any, body: any) => {
      group.dragBoundFunc((pos: { x: number; y: number }) => {
        try {
          let nx = pos.x;
          let ny = pos.y;

          // Snap/clamp ai bordi dello stage con AABB VISIVO
          const stageW = this.stage.width();
          const stageH = this.stage.height();

          let aabb = getClientRectAt(group, nx, ny);
          if (Math.abs(aabb.x - 0) <= this.SNAP) nx += 0 - aabb.x;
          if (Math.abs(aabb.x + aabb.width - stageW) <= this.SNAP) nx += stageW - (aabb.x + aabb.width);

          aabb = getClientRectAt(group, nx, ny);
          if (Math.abs(aabb.y - 0) <= this.SNAP) ny += 0 - aabb.y;
          if (Math.abs(aabb.y + aabb.height - stageH) <= this.SNAP) ny += stageH - (aabb.y + aabb.height);

          // Snap edge→edge ruotato
          const near = findSnapToEdgesGroupRotated(group, this.shapes, body, nx, ny, this.SNAP);
          if (near) {
            nx = near.x;
            ny = near.y;
          }

          // No overlap
          if (collidesAnyGroup(group, this.shapes, nx, ny)) {
            return { x: group.x(), y: group.y() };
          }
          return { x: nx, y: ny };
        } catch {
          return { x: group.x(), y: group.y() };
        }
      });

      group.on('mousedown', () => this.attachTransformerTo(group));
    };

    // Disegno (dblclick → drag → mouseup)
    this.drawingCtl = new DrawingController({
      Konva: this.Konva,
      stage: this.stage,
      layer: this.layer,
      shapesRef: this.shapes,
      minSize: this.MIN_SIZE,
      onCommit: async (x, y, w2, h2) => {
        const api = await createSmartRect(this.Konva, { x, y, w: w2, h: h2, fill: '#60a5fa' });
        applyDragBound(api.group, api.body);
        this.shapes.push(api.group);
        this.layer.add(api.group);
      },
    });
    this.drawingCtl.init();

    // Demo
    await this.addDemoRect(40, 40, 160, 100, '#60a5fa', applyDragBound);
    await this.addDemoRect(260, 200, 140, 120, '#f59e0b', applyDragBound);
    this.layer.draw();

    // ResizeObserver
    this.resizeObs = new ResizeObserver(() => {
      const r = this.host.nativeElement.getBoundingClientRect();
      this.stage.size({ width: Math.max(1, r.width), height: Math.max(1, r.height) });
      this.layer.batchDraw();
    });
    this.resizeObs.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.drawingCtl?.destroy();
    this.resizeObs?.disconnect();
    this.stage?.destroy();
  }

  /* ---------------- helpers ---------------- */

  private attachTransformerTo(target: any | null) {
    if (!target) {
      this.transformer.nodes([]);
      this.transformer.moveToTop();
      this.layer.batchDraw();
      return;
    }

    this.transformer.nodes([target]);
    this.transformer.moveToTop();

    target.off('transformend.resize');
    target.off('transformstart.guard');
    target.off('transform.guard');

    // Consolidamento post-resize + snap/clamp finali
    target.on('transformend.resize', () => {
      const body = target.findOne('.body') as any;
      if (!body) {
        this.layer.batchDraw();
        return;
      }

      // A) salva TL assoluto PRIMA del bake
      const beforeTL = body.getAbsoluteTransform().point({ x: 0, y: 0 });

      // B) bake della scala sul body
      const sx = target.scaleX();
      const sy = target.scaleY();
      body.size({ width: body.width() * sx, height: body.height() * sy });
      target.scale({ x: 1, y: 1 });

      // C) aggiorna avatar (se presente)
      const w = body.width();
      const h = body.height();
      const avatarG = target.findOne('.avatar') as any;
      if (avatarG) {
        const r = Math.min(w, h) * 0.2;
        avatarG.position({ x: w / 2, y: h / 2 });
        avatarG.offset({ x: r, y: r });
        const img = avatarG.findOne('Image') as any;
        if (img) img.size({ width: r * 2, height: r * 2 });
      }

      // D) riallinea il group per mantenere fermo il TL assoluto del body
      const afterTL = body.getAbsoluteTransform().point({ x: 0, y: 0 });
      const dx = beforeTL.x - afterTL.x;
      const dy = beforeTL.y - afterTL.y;
      target.position({ x: target.x() + dx, y: target.y() + dy });

      // E) snap edge→edge ruotato
      let nx = target.x();
      let ny = target.y();
      const snap = findSnapToEdgesGroupRotated(target, this.shapes, body, nx, ny, this.SNAP);
      if (snap) {
        nx = snap.x;
        ny = snap.y;
      }

      // F) clamp AABB dentro stage
      const aabb = target.getClientRect({ skipShadow: true, skipStroke: true });
      const stageW = this.stage.width();
      const stageH = this.stage.height();
      if (aabb.x < 0) nx += -aabb.x;
      if (aabb.y < 0) ny += -aabb.y;
      if (aabb.x + aabb.width > stageW) nx -= aabb.x + aabb.width - stageW;
      if (aabb.y + aabb.height > stageH) ny -= aabb.y + aabb.height - stageH;

      // G) applica se non collide
      if (!collidesAnyGroup(target, this.shapes, nx, ny)) {
        target.position({ x: nx, y: ny });
      }

      this.transformer.moveToTop();
      this.layer.batchDraw();
    });

    this.layer.batchDraw();
  }

  private async addDemoRect(
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    applyDragBound: (group: any, body: any) => void
  ) {
    const api = await createSmartRect(this.Konva, { x, y, w, h, fill });
    applyDragBound(api.group, api.body);
    this.shapes.push(api.group);
    this.layer.add(api.group);
  }

  private async ensureHostSize(): Promise<{ w: number; h: number }> {
    const ensure = () => {
      const r = this.host.nativeElement.getBoundingClientRect();
      return { w: Math.floor(r.width), h: Math.floor(r.height || 520) };
    };
    let { w, h } = ensure();
    if (w && h) return { w, h };
    await new Promise<void>((resolve) => {
      const raf = () => {
        ({ w, h } = ensure());
        if (w && h) return resolve();
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    });
    return { w, h };
  }
}
