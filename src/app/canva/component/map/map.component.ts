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
import { snapTo, collidesAnyGroup, findSnapToEdgesGroup } from '../../../utils/geometry.util';
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

  private shapes: any[] = []; // Group smart
  private resizeObs?: ResizeObserver;

  // tuning
  private readonly SNAP = 8;
  private readonly MIN_SIZE = 16;

  // drawing
  private drawingCtl?: DrawingController;

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  async ngAfterViewInit(): Promise<void> {

    if (!this.isBrowser) return;

    const mod = await import('konva');
    this.Konva = mod.default;

    const { w, h } = await this.ensureHostSize();

    // Stage + Layer
    this.stage = new this.Konva.Stage({
      container: this.host.nativeElement,
      width: w,
      height: h,
    });

    this.layer = new this.Konva.Layer();
    this.stage.add(this.layer);

    // Transformer (no-overlap + bordi dentro stage gestiti nella boundBoxFunc)
    this.transformer = makeTransformer(this.Konva, this.stage, this.layer, this.shapes, {
      rotateEnabled: true,
      minSize: this.MIN_SIZE,
    });

    // Click vuoto = deselezione
    this.stage.on('mousedown', (e: any) => {
      if (e.target === this.stage) this.attachTransformerTo(null);
    });

    // DragBound per nuove shape
    const applyDragBound = (group: any, body: any) => {

      group.dragBoundFunc((pos: { x: number; y: number }) => {

        let nx = snapTo(pos.x, 0, this.stage.width() - body.width(), this.SNAP);
        let ny = snapTo(pos.y, 0, this.stage.height() - body.height(), this.SNAP);

        const near = findSnapToEdgesGroup(group, this.shapes, body, nx, ny, this.SNAP);
        if (near) { nx = near.x; ny = near.y; }

        if (collidesAnyGroup(group, this.shapes, nx, ny)) {
          return { x: group.x(), y: group.y() };
        }
        return { x: nx, y: ny };
      });

      group.on('mousedown', () => this.attachTransformerTo(group));
    };

    // Disegno (dblclick → drag → mouseup): NESSUNA immagine
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

    // Demo: 2 shape iniziali SENZA immagine
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
      this.layer.draw();
      return;
    }
    this.transformer.nodes([target]);

    // Consolidamento post-resize
    target.off('transformend.resize');

    target.on('transformend.resize', () => {

      const body = target.findOne('.body') as any;
      const w = body.width() * target.scaleX();
      const h = body.height() * target.scaleY();
      body.size({ width: w, height: h });
      target.scale({ x: 1, y: 1 });

      // se esiste un avatar, ricentralo/scalalo
      const avatarG = target.findOne('.avatar') as any;
      if (avatarG) {
        const r = Math.min(w, h) * 0.2;
        avatarG.position({ x: w / 2, y: h / 2 });
        avatarG.offset({ x: r, y: r });
        const img = avatarG.findOne('Image') as any;
        if (img) img.size({ width: r * 2, height: r * 2 });
      }

      this.layer.draw();
    });

    this.layer.draw();
  }

  private async addDemoRect(
    x: number, y: number, w: number, h: number,
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
