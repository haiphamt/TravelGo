import { Injectable, signal } from "@angular/core";
import { csrfCookie } from "./places-api";
import type { AuthMode, AuthSubmission } from "./auth-dialog";

type AuthUser = { id: string; name: string; email: string; admin?: boolean };
type AuthSession = { user: AuthUser | null; googleEnabled: boolean };

@Injectable({ providedIn: "root" })
export class Auth {
  readonly user = signal<AuthUser | null>(null);
  readonly googleEnabled = signal(false);
  readonly pending = signal(false);
  readonly ready = signal(false);
  readonly error = signal("");
  readonly prompt = signal<{ mode: AuthMode } | null>(null);

  private readonly initialSession = this.loadSession().catch(() => {}).finally(() => this.ready.set(true));

  open(mode: AuthMode = "login") {
    this.error.set("");
    this.prompt.set({ mode });
  }

  async submit({ mode, ...data }: AuthSubmission) {
    return this.update(mode, data);
  }

  async logout() {
    return this.update("logout", {});
  }

  private async update(path: "login" | "register" | "logout", data: object) {
    if (this.pending()) return false;
    this.pending.set(true);
    this.error.set("");
    try {
      await this.initialSession;
      // A fresh web session also supplies the CSRF cookie for this request.
      await this.loadSession();
      const response = await this.request(path, data);
      if (response.status === 204 && path === "logout") {
        this.user.set(null);
      } else {
        await this.readSession(response, path);
      }
      return true;
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Chưa thực hiện được. Vui lòng thử lại.");
      return false;
    } finally {
      this.pending.set(false);
    }
  }

  private async loadSession() {
    await this.readSession(await this.request("session"));
  }

  private async request(path: string, data?: object) {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (data) {
      headers["Content-Type"] = "application/json";
      const token = csrfCookie(document.cookie);
      if (token) headers["X-XSRF-TOKEN"] = token;
    }
    try {
      return await fetch(`/api/auth/${path}`, {
        method: data ? "POST" : "GET", credentials: "same-origin", cache: "no-store", headers,
        signal: AbortSignal.timeout(15_000), ...(data ? { body: JSON.stringify(data) } : {}),
      });
    } catch {
      throw new Error("Chưa kết nối được TravelGo. Vui lòng thử lại.");
    }
  }

  private async readSession(response: Response, path = "session") {
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const validation = response.status === 422 && body?.errors && typeof body.errors === "object"
        ? Object.values(body.errors).flat().find(value => typeof value === "string") : undefined;
      const message = response.status === 401 && path === "login" ? "Email hoặc mật khẩu chưa đúng."
        : response.status === 419 ? "Phiên đã hết hạn. Hãy thử lại."
        : response.status === 409 ? "Phiên đăng nhập vừa thay đổi. Hãy tải lại trang."
        : response.status === 429 ? "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau."
        : typeof validation === "string" ? validation : "TravelGo chưa xử lý được yêu cầu. Vui lòng thử lại.";
      throw new Error(message);
    }
    if (typeof body?.googleEnabled !== "boolean" || (body.user === null
      ? path !== "session"
      : typeof body.user?.id !== "string" || typeof body.user?.name !== "string" || typeof body.user?.email !== "string")) {
      throw new Error("TravelGo trả về thông tin phiên không hợp lệ.");
    }
    const session = body as AuthSession;
    this.user.set(session.user);
    this.googleEnabled.set(session.googleEnabled);
  }
}
