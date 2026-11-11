import { Component, input } from "@angular/core";
const PATHS: Record<string, string> = {
  pin: "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  compass: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M16 8l-3 5-5 3 3-5Z",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  calendar:
    "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2",
  search: "M19 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0m-2 5 5 6",
  coffee:
    "M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4ZM17 9h2a3 3 0 0 1 0 6h-2M6 2v3m4-3v3m4-3v3M2 22h18",
  utensils: "M4 2v7a3 3 0 0 0 6 0V2M7 2v20M20 2c-5 2-5 10 0 10m0-10v20",
  leaf: "M20 3c-1 6 3 9-2 14-4 4-10 3-12 0S3 8 8 6c3-1 8 0 12-3ZM3 22 15 10",
  landmark: "m3 7 9-5 9 5H3M5 10v8m5-8v8m4-8v8m5-8v8M3 21h18",
  grid: "M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  back: "M20 12H4m6-6-6 6 6 6",
  plus: "M12 4v16M4 12h16",
  star: "m12 2 3 6.5 7 1-5 5 1.2 7-6.2-3.3L5.8 22 7 14.5l-5-5 7-1Z",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2",
  camera: "M3 6h4l2-3h6l2 3h4v15H3ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  image: "M3 3h18v18H3ZM3 17l5-6 4 4 3-3 6 7M17 7h.01",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M18 6 6 18",
  menu: "M4 6h16M4 12h16M4 18h16",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  up: "m6 15 6-6 6 6",
  down: "m6 9 6 6 6-6",
  store: "M3 10h18L19 3H5ZM4 10v11h16V10M9 21v-7h6v7",
  info: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 11v6m0-10h.01",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2",
  users: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M2 21v-2a8 8 0 0 1 16 0v2M18 3a4 4 0 0 1 0 8m2 4a7 7 0 0 1 2 5v1",
  shield: "m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6Zm-5 10 3 3 7-7",
  map: "m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Zm6-3v15m6-12v15",
  bed: "M3 18v4m18-4v4M3 12h18v6H3Zm2 0V5h14v7M7 9h3m4 0h3",
  glass: "M5 3h14l-1 10a6 6 0 0 1-12 0ZM12 19v3m-4 0h8M6 8h12",
  external: "M14 3h7v7m0-7L10 14M10 3H3v18h18v-7",
};
@Component({
  selector: "tg-icon",
  standalone: true,
  template:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="path()" /></svg>',
  styles:
    ":host{display:inline-flex;width:1.25rem;height:1.25rem;flex:none}svg{width:100%;height:100%}",
})
export class Icon {
  name = input("pin");
  path() {
    return PATHS[this.name()] ?? PATHS["pin"];
  }
}
