import { inject } from "@angular/core";
import { Router, type CanActivateFn } from "@angular/router";
import { WorkflowStore } from "./workflow-store";

export function moderationGuard(admin = false): CanActivateFn {
  return async () => {
    const workflow = inject(WorkflowStore);
    const router = inject(Router);
    return await workflow.authorize(admin) || router.parseUrl("/tai-khoan");
  };
}
