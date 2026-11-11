import { bootstrapApplication } from "@angular/platform-browser";
import { inject } from "@angular/core";
import { Router, provideRouter, withInMemoryScrolling, type RedirectFunction } from "@angular/router";
import { App } from "./app/app";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { providePrimeNG } from "primeng/config";
import Aura from "@primeng/themes/aura";
import type { Trip } from "./app/trip";

// Static hosting may decode the escaped slash in an OSM place ID on a full-page request.
function restoreOsmPlaceLink(review: boolean): RedirectFunction {
  return ({ params, queryParams }) => {
    const router = inject(Router);
    const { osmType, osmNumber } = params;
    if (!/^osm:(node|way|relation)$/.test(osmType) || !/^\d+$/.test(osmNumber)) {
      return router.parseUrl("/");
    }
    const commands = ["/dia-diem", `${osmType}/${osmNumber}`];
    if (review) commands.push("danh-gia");
    return router.createUrlTree(commands, { queryParams });
  };
}

bootstrapApplication(App, {
  providers: [
    provideAnimationsAsync(),
    providePrimeNG({ theme: { preset: Aura, options: { darkModeSelector: "none" } } }),
    provideRouter(
      [
        {
          path: "",
          loadComponent: () => import("./app/home").then((m) => m.Home),
          title: "TravelGo — Khám phá TP. Hồ Chí Minh",
        },
        {
          path: "ho-so-uu-tien",
          loadComponent: () => import("./app/priority-review").then(m => m.PriorityReview),
          title: "250 cơ sở ưu tiên · TravelGo",
        },
        {
          path: "kham-pha",
          loadComponent: () => import("./app/explore").then((m) => m.Explore),
          data: { mode: "explore" },
          title: "Khám phá · TravelGo",
        },
        {
          path: "goc-dia-phuong",
          loadComponent: () => import("./app/explore").then((m) => m.Explore),
          data: { mode: "local" },
          title: "Góc Địa Phương · TravelGo",
        },
        {
          path: "yeu-thich",
          loadComponent: () => import("./app/explore").then((m) => m.Explore),
          data: { mode: "favorites" },
          title: "Yêu thích · TravelGo",
        },
        {
          path: "dia-diem/:id/danh-gia",
          loadComponent: () => import("./app/review").then((m) => m.ReviewPage),
          title: "Viết đánh giá · TravelGo",
        },
        {
          path: "dia-diem/:osmType/:osmNumber/danh-gia",
          pathMatch: "full",
          redirectTo: restoreOsmPlaceLink(true),
        },
        {
          path: "dia-diem/:osmType/:osmNumber",
          pathMatch: "full",
          redirectTo: restoreOsmPlaceLink(false),
        },
        {
          path: "dia-diem/:id",
          loadComponent: () => import("./app/detail").then((m) => m.Detail),
          title: "Chi tiết địa điểm · TravelGo",
        },
        {
          path: "lich-trinh/tao",
          pathMatch: "full",
          redirectTo: ({queryParams}) => queryParams["mode"] === "ai" ? "/lich-trinh/tao-ai" : "/lich-trinh/tao-thu-cong",
        },
        {
          path: "lich-trinh/tao-ai",
          loadComponent: () => import("./app/didaune/planner-create-ai/planner-create-ai").then(m => m.PlannerCreateAi),
          title: "Tạo lịch trình bằng AI · TravelGo",
        },
        {
          path: "lich-trinh/tao-thu-cong",
          loadComponent: () => import("./app/trip-builder").then((m) => m.TripBuilder),
          title: "Tạo lịch trình thủ công · TravelGo",
        },
        {
          path: "lich-trinh/chinh-sua",
          loadComponent: () => import("./app/trip").then((m) => m.Trip),
          canDeactivate: [(component: Trip) => component.canLeave()],
          title: "Chỉnh sửa chuyến đi · TravelGo",
        },
        {
          path: "lich-trinh",
          loadComponent: () => import("./app/didaune/planner-list/planner-list").then(m => m.PlannerList),
          title: "Lịch trình của bạn · TravelGo",
        },
        {
          path: "phong-cung-di",
          loadComponent: () => import("./app/group-room").then((m) => m.GroupRoom),
          title: "Phòng cùng đi · TravelGo",
        },
        {
          path: "ban-do",
          loadComponent: () => import("./app/map-page").then(m => m.MapPage),
          title: "Bản đồ TP. Hồ Chí Minh · TravelGo",
        },
        {
          path: "dong-gop",
          loadComponent: () => import("./app/contributions").then(m => m.Contributions),
          title: "Đóng góp của tôi · TravelGo",
        },
        {
          path: "chu-co-so",
          data: { workspace: "owner" },
          loadComponent: () => import("./app/owner-workspace").then(m => m.OwnerWorkspace),
          title: "Chủ cơ sở · TravelGo",
        },
        {
          path: "quan-tri",
          data: { workspace: "admin" },
          loadComponent: () => import("./app/admin-workspace").then(m => m.AdminWorkspace),
          title: "Quản trị viên · TravelGo",
        },
        ...[
          { path: "tai-khoan", kind: "account", title: "Tài khoản · TravelGo" },
          { path: "nguon-du-lieu", kind: "sources", title: "Nguồn dữ liệu · TravelGo" },
        ].map(route => ({ path: route.path, title: route.title, data: { kind: route.kind },
          loadComponent: () => import("./app/feature-status").then(m => m.FeatureStatus) })),
        { path: "**", redirectTo: "" },
      ],
      withInMemoryScrolling({ scrollPositionRestoration: "enabled" }),
    ),
  ],
}).catch((error) => console.error(error));
