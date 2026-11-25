import { bootstrapApplication } from "@angular/platform-browser";
import { inject } from "@angular/core";
import { Router, provideRouter, withInMemoryScrolling, type CanMatchFn, type RedirectFunction } from "@angular/router";
import { App } from "./app/app";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { providePrimeNG } from "primeng/config";
import Aura from "@primeng/themes/aura";
import type { Trip } from "./app/trip";
import { moderationGuard } from "./app/moderation-guard";
import { Auth } from "./app/auth";

// Guests match a sign-in screen at the same URL to retain place and room links.
const signedIn: CanMatchFn = async () => {
  const auth = inject(Auth);
  await auth.waitForInitialSession();
  return auth.user() !== null;
};

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
          pathMatch: "full",
          redirectTo: ({ queryParams }) => inject(Router).createUrlTree(["/kham-pha"], {
            queryParams: { q: queryParams["q"] },
          }),
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
          canMatch: [signedIn],
          loadComponent: () => import("./app/group-room").then((m) => m.GroupRoom),
          title: "Phòng cùng đi · TravelGo",
        },
        {
          path: "phong-cung-di",
          loadComponent: () => import("./app/auth-required").then(m => m.AuthRequired),
          data: { authRequired: "Đăng nhập để tạo phòng, tham gia bằng mã mời và cùng bạn bè lên lịch trình." },
          title: "Phòng cùng đi · TravelGo",
        },
        {
          path: "ban-do",
          loadComponent: () => import("./app/map-page").then(m => m.MapPage),
          title: "Bản đồ TP. Hồ Chí Minh · TravelGo",
        },
        {
          path: "dong-gop",
          canMatch: [signedIn],
          canActivate: [moderationGuard()],
          loadComponent: () => import("./app/contributions").then(m => m.Contributions),
          title: "Đóng góp của tôi · TravelGo",
        },
        {
          path: "dong-gop",
          loadComponent: () => import("./app/auth-required").then(m => m.AuthRequired),
          data: { authRequired: "Đăng nhập để chia sẻ địa điểm, gửi đề xuất cập nhật và theo dõi kết quả xét duyệt." },
          title: "Đóng góp của tôi · TravelGo",
        },
        {
          path: "chu-co-so",
          canActivate: [moderationGuard()],
          data: { workspace: "owner" },
          loadComponent: () => import("./app/owner-workspace").then(m => m.OwnerWorkspace),
          title: "Chủ cơ sở · TravelGo",
        },
        {
          path: "quan-tri",
          canActivate: [moderationGuard(true)],
          data: { workspace: "admin" },
          loadComponent: () => import("./app/admin-workspace").then(m => m.AdminWorkspace),
          title: "Quản trị viên · TravelGo",
        },
        {
          path: "tai-khoan",
          title: "Tài khoản · TravelGo",
          loadComponent: () => import("./app/account").then(m => m.Account),
        },
        {
          path: "nguon-du-lieu",
          title: "Nguồn dữ liệu · TravelGo",
          loadComponent: () => import("./app/feature-status").then(m => m.FeatureStatus),
        },
        { path: "**", redirectTo: "" },
      ],
      withInMemoryScrolling({ scrollPositionRestoration: "enabled" }),
    ),
  ],
}).catch((error) => console.error(error));
