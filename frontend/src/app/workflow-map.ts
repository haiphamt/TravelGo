import { AfterViewInit, Component, DestroyRef, ElementRef, inject, input, signal, viewChild } from "@angular/core";
import type { Map as LeafletMap } from "leaflet";

@Component({
  selector: "tg-workflow-map",
  standalone: true,
  template: `
    <div class="workflow-map">
      <div #canvas class="workflow-map-canvas" aria-label="Bản đồ đối chiếu vị trí" role="region"></div>
      <ul class="workflow-map-legend">@for (point of points(); track point.label) {
        <li><span [class.proposed]="point.label === 'Vị trí đề xuất'"></span>{{ point.label }} · {{ point.lat }}, {{ point.lng }}</li>
      }</ul>
      @if (status()) {<p class="muted" role="status">{{ status() }}</p>}
    </div>
  `,
})
export class WorkflowMap implements AfterViewInit {
  readonly points = input.required<readonly { lat: number; lng: number; label: string }[]>();
  readonly status = signal("Đang tải bản đồ đối chiếu…");
  private readonly canvas = viewChild.required<ElementRef<HTMLDivElement>>("canvas");
  private map?: LeafletMap;
  private observer?: ResizeObserver;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.observer?.disconnect();
      this.map?.remove();
    });
  }
  ngAfterViewInit() { void this.load(); }
  private async load() {
    try {
      const L = (await import("leaflet")).default;
      if (this.destroyed) return;
      const points = this.points();
      if (!points.length) { this.status.set("Chưa có tọa độ để đối chiếu."); return; }
      const element = this.canvas().nativeElement;
      const map = L.map(element, { scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false });
      this.map = map;
      const coordinates = points.map(point => L.latLng(point.lat, point.lng));
      if (coordinates.length === 1) map.setView(coordinates[0], 16);
      else map.fitBounds(L.latLngBounds(coordinates), { padding: [36, 36], maxZoom: 16, animate: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>',
      }).on("tileerror", () => this.status.set("Nền bản đồ chưa tải đủ. Tọa độ vẫn có ở phần đối chiếu." )).addTo(map);
      for (const point of points) {
        const color = point.label === "Vị trí đề xuất" ? "#c2410c" : "#175cd3";
        L.circleMarker([point.lat, point.lng], { radius: 9, color, fillColor: color, fillOpacity: 0.85 })
          .bindTooltip(point.label).addTo(map);
      }
      this.observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
      this.observer.observe(element);
      this.status.set("");
    } catch {
      this.map?.remove();
      this.map = undefined;
      this.status.set("Chưa tải được bản đồ đối chiếu. Bạn có thể đọc tọa độ ở danh sách bên dưới.");
    }
  }
}
