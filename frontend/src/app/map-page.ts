import { AfterViewInit, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import type { Map as LeafletMap, LayerGroup, TileLayer } from "leaflet";
import { CATEGORIES, FACET_LABELS, type Category, type Place } from "./data";
import { discoveryQuery, filterPlaces, parseDiscoveryFilters } from "./discovery";
import { groupMapPoints, hasCoordinates, nearbyMapPoints, NEARBY_RADIUS_METERS, type Coordinates } from "./geo";
import { mapsLink } from "./logic";
import { TravelStore } from "./store";
import { Icon } from "./icon";

const CATEGORY_ICONS: Record<Category, string> = {
  all: "fa-layer-group",
  coffee: "fa-mug-hot",
  food: "fa-utensils",
  nature: "fa-tree",
  culture: "fa-camera",
  drink: "fa-martini-glass-citrus",
  lodging: "fa-bed",
};

// Didaune MapPage at 04597f6, backed by the TravelGo catalog and URL context.
@Component({
  standalone: true,
  imports: [RouterLink, FormsModule, Icon],
  templateUrl: "./map-page.html",
  styleUrl: "./map-page.css",
  host: { class: "didaune-ui" },
})
export class MapPage implements AfterViewInit {
  store = inject(TravelStore);
  route = inject(ActivatedRoute);
  router = inject(Router);
  destroyRef = inject(DestroyRef);
  private injector = inject(Injector);
  container = viewChild.required<ElementRef<HTMLDivElement>>("mapContainer");
  private selectionHeading = viewChild<ElementRef<HTMLHeadingElement>>("selectionHeading");
  categories = CATEGORIES;
  categoryIcons = CATEGORY_ICONS;
  facetLabels = FACET_LABELS;
  readonly pageSize = 18;
  hasCoordinates = hasCoordinates;
  filters = signal(parseDiscoveryFilters({ get: () => null }));
  filtersOpen = signal(false);
  filtersActive = computed(() => {
    const filters = this.filters();
    return filters.category !== "all" || filters.localOnly || !!filters.area || !!filters.district || !!filters.facet;
  });
  searchDraft = "";
  page = signal(0);
  selectedId = signal("");
  originLocal = signal(false);
  selectedPhotoFailed = signal(false);
  mapReady = signal(false);
  mapError = signal("");
  tileStatus = signal<"loading" | "ready" | "error">("loading");
  tileProvider = signal<"osm" | "topo">("osm");
  usingFallback = signal(false);
  visibleOnMap = signal(0);
  locating = signal(false);
  nearby = signal<Coordinates | null>(null);
  locationMessage = signal("");
  private viewVersion = signal(0);
  private map?: LeafletMap;
  private leaflet?: typeof import("leaflet");
  private markers?: LayerGroup;
  private tiles?: TileLayer;
  private locationLayers?: LayerGroup;
  private resizeObserver?: ResizeObserver;
  private initializing = false;
  private destroyed = false;
  private focusedId = "";
  private tileTimeout?: ReturnType<typeof setTimeout>;
  private searchTimer?: ReturnType<typeof setTimeout>;
  filtered = computed(() => {
    const places = filterPlaces(this.store.places(), this.filters());
    const nearby = this.nearby();
    return nearby ? nearbyMapPoints(places, nearby) : places;
  });
  localTypes = computed(() => [...new Set(this.store.places().filter(place => place.local).map(place => place.localProfile?.categoryLabel).filter((type): type is string => !!type))].sort((a,b) => a.localeCompare(b,"vi")));
  listRoute = computed(() => this.originLocal() && this.filters().localOnly ? "/goc-dia-phuong" : "/kham-pha");
  geocoded = computed(() => this.filtered().filter(hasCoordinates));
  missingCoordinates = computed(() => this.filtered().length - this.geocoded().length);
  selected = computed(() => this.store.places().find(place => place.id === this.selectedId()));
  selectedMatches = computed(() => this.filtered().some(place => place.id === this.selectedId()));
  pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  currentPage = computed(() => {
    const selectedPage = Math.floor(this.filtered().findIndex(place => place.id === this.selectedId()) / this.pageSize) + 1;
    return Math.min(this.page() || Math.max(1, selectedPage), this.pageCount());
  });
  visible = computed(() => this.filtered().slice((this.currentPage() - 1) * this.pageSize, this.currentPage() * this.pageSize));
  listQuery = computed(() => ({ ...discoveryQuery(this.filters()), page: !this.nearby() && (this.page() > 0 || this.currentPage() > 1) ? String(this.currentPage()) : null }));
  detailContext = computed<Record<string, string | null>>(() => ({ ...this.listQuery(), from: "/ban-do", place: this.selectedId() || null, origin: this.originLocal() ? "local" : null }));

  constructor() {
    try { if (sessionStorage.getItem("travelgo-map-layer") === "topo") this.tileProvider.set("topo"); } catch { /* The map remains usable when preference storage is unavailable. */ }
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const filters = parseDiscoveryFilters(params);
      const previous = this.filters();
      if ((filters.facet && filters.facet !== previous.facet) ||
          (filters.area && filters.area !== previous.area) ||
          (filters.district && filters.district !== previous.district)) {
        this.filtersOpen.set(true);
      }
      if (filters.query !== previous.query && filters.query !== this.searchDraft.trim()) {
        clearTimeout(this.searchTimer);
        this.searchDraft = filters.query;
      }
      this.filters.set(filters);
      this.originLocal.set(params.get("origin") === "local" && filters.localOnly);
      const page = Number(params.get("page"));
      this.page.set(Number.isSafeInteger(page) && page > 0 ? page : 0);
      const id = params.get("place") ?? "";
      if (id !== this.selectedId()) this.selectedPhotoFailed.set(false);
      this.selectedId.set(id);
    });
    effect(() => {
      const points = this.geocoded();
      const id = this.selectedId();
      this.viewVersion();
      if (this.mapReady()) untracked(() => this.renderMarkers(points, id));
    });
    effect(() => {
      const selected = this.selected();
      if (this.mapReady() && selected) untracked(() => {
        if (this.focusedId !== selected.id) { this.focusedId = selected.id; this.focusPlace(selected); }
      });
    });
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.searchTimer);
      clearTimeout(this.tileTimeout);
      this.resizeObserver?.disconnect();
      this.map?.remove();
      this.tiles?.off();
    });
  }
  ngAfterViewInit() { void this.initializeMap(); }
  async initializeMap() {
    if (this.initializing || this.destroyed) return;
    this.initializing = true;
    this.mapError.set("");
    try {
      const L = (await import("leaflet")).default;
      if (this.destroyed) return;
      this.leaflet = L;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.map = L.map(this.container().nativeElement, { zoomControl: false, zoomAnimation: !reduced, fadeAnimation: !reduced }).setView([10.7769, 106.7009], 12);
      L.control.zoom({ zoomInTitle: "Phóng to", zoomOutTitle: "Thu nhỏ" }).addTo(this.map);
      this.setTileLayer();
      this.markers = L.layerGroup().addTo(this.map);
      this.map.on("moveend zoomend", () => this.viewVersion.update(value => value + 1));
      this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize({ pan: false }));
      this.resizeObserver.observe(this.container().nativeElement);
      this.focusedId = "";
      this.mapReady.set(true);
    } catch {
      this.map?.remove();
      this.map = undefined;
      this.mapReady.set(false);
      this.mapError.set("Chưa tải được bản đồ. Bạn vẫn tìm kiếm và chọn địa điểm bằng danh sách bên dưới.");
    } finally { this.initializing = false; }
  }
  private renderMarkers(points: (Place & {lat: number; lng: number})[], selectedId: string) {
    const map = this.map, L = this.leaflet, markers = this.markers;
    if (!map || !L || !markers) return;
    markers.clearLayers();
    const visible = points.filter(point => map.getBounds().contains([point.lat, point.lng]));
    this.visibleOnMap.set(visible.length);
    const selected = visible.find(place => place.id === selectedId);
    for (const group of groupMapPoints(visible.filter(place => place.id !== selectedId), map.getZoom())) {
      if (group.places.length === 1) { this.addMarker(group.places[0], false); continue; }
      const count = group.places.length;
      // Color a spatial group by its most common category. The count covers the entire group.
      const categories = new Map<Place["category"], number>();
      let leadingCategory = group.places[0].category;
      for (const place of group.places) {
        const total = (categories.get(place.category) ?? 0) + 1;
        categories.set(place.category, total);
        if (total > (categories.get(leadingCategory) ?? 0)) leadingCategory = place.category;
      }
      const marker = L.marker([group.lat, group.lng], {
        icon: this.markerIcon(leadingCategory, count),
        title: `Nhóm ${count} địa điểm, bấm để phóng to`,
        alt: `Nhóm ${count} địa điểm`,
      });
      marker.on("click", () => {
        if (map.getZoom() >= 19) {
          this.selectPlace(group.places[0]);
          this.locationMessage.set(`${count} hồ sơ có vị trí rất gần hoặc trùng nhau. Hãy dùng danh sách để chọn từng hồ sơ.`);
        } else map.setView([group.lat, group.lng], Math.min(map.getZoom() + 2, 19));
      });
      markers.addLayer(marker);
    }
    if (selected) this.addMarker(selected, true);
  }
  private addMarker(place: Place & {lat: number; lng: number}, selected: boolean) {
    const L = this.leaflet!;
    const marker = L.marker([place.lat, place.lng], {
      icon: this.markerIcon(place.category, 1, selected),
      title: `Chọn ${place.name}`,
      alt: place.name,
      zIndexOffset: selected ? 1000 : 0,
    });
    const tooltip = document.createElement("span");
    tooltip.textContent = place.name;
    marker.bindTooltip(tooltip, { direction: "top", offset: [0, -34] }).on("click", () => this.selectPlace(place));
    this.markers!.addLayer(marker);
  }
  private markerIcon(category: Place["category"], count: number, selected = false) {
    const cluster = count > 1;
    const icon = CATEGORY_ICONS[category] ?? "fa-location-dot";
    const markerClass = Object.hasOwn(CATEGORY_ICONS, category) ? `map-pin-${category}` : "";
    const badge = cluster ? `<span class="map-pin-count">${count}</span>` : "";
    return this.leaflet!.divIcon({
      className: `map-pin-wrapper ${markerClass}${cluster ? " map-pin-cluster" : ""}${selected ? " map-pin-selected" : ""}`,
      html: `<span class="map-pin" aria-hidden="true"><i class="fa-solid ${icon}"></i>${badge}</span>`,
      iconSize: cluster ? [52, 64] : [38, 50],
      iconAnchor: cluster ? [26, 64] : [19, 50],
    });
  }
  categoryLabel(place: Place) {
    return place.localProfile?.categoryLabel ?? CATEGORIES.find(item => item.id === place.category)?.name ?? "Địa điểm";
  }
  private focusPlace(place: Place) {
    if (hasCoordinates(place)) this.map?.setView([place.lat, place.lng], Math.max(this.map.getZoom(), 16), { animate: false });
  }
  selectPlace(place: Place) {
    const index = this.filtered().findIndex(item => item.id === place.id);
    const page = index >= 0 ? Math.floor(index / this.pageSize) + 1 : 1;
    this.focusPlace(place);
    void this.router.navigate([], { relativeTo: this.route, queryParams: {place: place.id, page}, queryParamsHandling: "merge", replaceUrl: true }).then(() => {
      if (this.destroyed) return;
      afterNextRender(() => {
        if (this.selectedId() === place.id) this.selectionHeading()?.nativeElement.focus();
      }, { injector: this.injector });
    });
  }
  clearSelection() { this.focusedId = ""; this.changeParams({place: null}); }
  changePage(page: number) { this.changeParams({page: String(Math.max(1, page))}); }
  changeFilters(filters: Record<string, string | null>) {
    clearTimeout(this.searchTimer);
    this.changeParams({q: this.searchDraft.trim() || null, ...filters, page: null});
  }
  private changeParams(queryParams: Record<string, string | null>) {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: "merge", replaceUrl: true });
  }
  updateSearch(query: string) {
    this.searchDraft = query;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applySearch(), 220);
  }
  applySearch() {
    clearTimeout(this.searchTimer);
    if (this.searchDraft.trim() !== this.filters().query) this.changeFilters({});
  }
  toggleLocal(event: Event) {
    const enabled = (event.target as HTMLInputElement).checked;
    this.changeFilters(enabled ? {local: "1"} : {local: null, localType: null, origin: null});
  }
  clearFilters() {
    this.searchDraft = "";
    this.changeFilters({area: null, district: null, category: null, facet: null, localType: null, local: this.originLocal() ? "1" : null, sort: null});
  }
  async showSelected() {
    const place = this.selected();
    const keepLocal = this.originLocal() && !!place?.local;
    if (this.nearby()) this.clearNearby();
    clearTimeout(this.searchTimer);
    this.searchDraft = "";
    await this.router.navigate([], { relativeTo: this.route, queryParams: {place: place?.id, local: keepLocal ? "1" : null, origin: keepLocal ? "local" : null}, replaceUrl: true });
    if (place) { this.selectPlace(place); this.focusPlace(place); }
  }
  centerCity() { this.map?.setView([10.7769, 106.7009], 12, { animate: false }); }
  fitResults() {
    const points = this.geocoded();
    if (!this.map || !this.leaflet || !points.length) return;
    this.map.fitBounds(this.leaflet.latLngBounds(points.map(place => [place.lat, place.lng])), {padding: [30, 30], maxZoom: 16, animate: false});
  }
  retryTiles() { this.setTileLayer(); }
  changeTileProvider(provider: "osm" | "topo") {
    if (provider !== "osm" && provider !== "topo") return;
    this.tileProvider.set(provider);
    this.usingFallback.set(false);
    try { sessionStorage.setItem("travelgo-map-layer", provider); } catch { /* Only this optional style preference is persisted. */ }
    this.setTileLayer();
  }
  private setTileLayer() {
    if (!this.map || !this.leaflet) return;
    this.tiles?.remove().off();
    clearTimeout(this.tileTimeout);
    this.tileStatus.set("loading");
    const osmCredit = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
    const topo = this.tileProvider() === "topo";
    const layer = this.leaflet.tileLayer(topo ? "https://tile.opentopomap.org/{z}/{x}/{y}.png" : "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: topo ? `${osmCredit}, SRTM | © <a href="https://opentopomap.org/about" target="_blank" rel="noopener noreferrer">OpenTopoMap (CC BY-SA)</a>` : osmCredit,
      maxZoom: 19, maxNativeZoom: topo ? 17 : 19,
    });
    this.tiles = layer;
    const failedTiles = new Set<HTMLElement>();
    const recover = () => {
      if (this.destroyed || this.tiles !== layer) return;
      if (topo) {
        this.tileStatus.set("error");
        return;
      }
      // Switch the whole base so blank tiles are replaced and attribution matches the visible layer.
      this.tileProvider.set("topo");
      this.usingFallback.set(true);
      this.setTileLayer();
    };
    layer.on({
      loading: () => {
        clearTimeout(this.tileTimeout);
        this.tileStatus.set("loading");
        this.tileTimeout = setTimeout(recover, 8_000);
      },
      tileerror: ({tile}) => failedTiles.add(tile),
      tileunload: ({tile}) => failedTiles.delete(tile),
      load: () => {
        clearTimeout(this.tileTimeout);
        if (failedTiles.size) {
          // Let Leaflet finish processing the current tile event before replacing the layer.
          this.tileTimeout = setTimeout(recover);
        } else {
          this.tileStatus.set("ready");
        }
      },
    });
    layer.addTo(this.map);
  }
  directions(place: Place) { return mapsLink([place]); }
  clearNearby() {
    this.locationLayers?.remove();
    this.nearby.set(null);
    this.locationMessage.set("");
  }
  locate() {
    if (this.locating() || !this.map) return;
    if (!navigator.geolocation) { this.locationMessage.set("Trình duyệt chưa hỗ trợ định vị. Bạn vẫn có thể kéo bản đồ hoặc tìm trong danh mục."); return; }
    this.locating.set(true);
    this.locationMessage.set("");
    navigator.geolocation.getCurrentPosition(position => {
      if (this.destroyed) return;
      const {latitude, longitude, accuracy} = position.coords;
      this.locating.set(false);
      if (!hasCoordinates({lat: latitude, lng: longitude})) { this.locationMessage.set("Vị trí trả về chưa hợp lệ. Hãy dùng tìm kiếm hoặc kéo bản đồ."); return; }
      const point: [number, number] = [latitude, longitude];
      const L = this.leaflet!;
      const circle = L.circle(point, {radius: NEARBY_RADIUS_METERS, color: "#1683bd", fillColor: "#38bdf8", weight: 3, fillOpacity: 0.2, interactive: false});
      const marker = L.circleMarker(point, {radius: 7, color: "#fff", fillColor: "#175cd3", fillOpacity: 1, weight: 3, interactive: false});
      this.locationLayers?.remove();
      this.locationLayers = L.layerGroup([circle, marker]).addTo(this.map!);
      this.nearby.set({lat: latitude, lng: longitude});
      this.changeParams({page: null});
      this.map!.fitBounds(circle.getBounds(), {padding: [22, 22], animate: false});
      this.locationMessage.set(`Đang tìm trong bán kính 5 km quanh bạn. Độ chính xác định vị khoảng ${Math.round(accuracy)} m.`);
    }, error => {
      if (this.destroyed) return;
      this.locating.set(false);
      this.locationMessage.set(error.code === 1 ? "Bạn chưa cấp quyền định vị. Danh sách và bản đồ vẫn dùng được; hãy tìm tên hoặc kéo đến khu vực muốn xem." : "Chưa lấy được vị trí. Hãy thử lại hoặc tìm địa điểm bằng tên và danh mục.");
    }, {enableHighAccuracy: false, timeout: 10000, maximumAge: 300000});
  }
}
