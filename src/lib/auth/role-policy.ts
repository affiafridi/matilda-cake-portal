import "server-only";
import type { User, UserRole } from "@prisma/client";

/**
 * Centralised authorization rules for user-management actions.
 * Keep all "who can touch whom" logic here so the UI and the API stay
 * in sync without duplication.
 */

/** Roles an actor is allowed to assign / promote a user to. */
export function assignableRoles(actor: User): UserRole[] {
  if (actor.role === "SUPER_ADMIN") {
    return ["SUPER_ADMIN", "ADMIN", "AGENT", "OPERATOR"];
  }
  if (actor.role === "ADMIN") {
    // ADMIN must NOT be able to promote anyone to SUPER_ADMIN.
    return ["ADMIN", "AGENT", "OPERATOR"];
  }
  return [];
}

/** Whether the actor is allowed to read/list a target user. */
export function canViewUser(actor: User, target: { role: UserRole }): boolean {
  if (actor.role === "SUPER_ADMIN") return true;
  if (actor.role === "ADMIN") return target.role !== "SUPER_ADMIN";
  return false;
}

/** Whether the actor is allowed to edit a target user. */
export function canEditUser(actor: User, target: User): boolean {
  if (actor.role === "SUPER_ADMIN") return true;
  if (actor.role === "ADMIN") return target.role !== "SUPER_ADMIN";
  return false;
}

/** Specific guard for assigning a particular role to a target. */
export function canAssignRole(actor: User, role: UserRole): boolean {
  return assignableRoles(actor).includes(role);
}

/**
 * Whether the actor may set `isActive` on the target. Forbids
 * deactivating yourself. Caller must also enforce "last super admin"
 * server-side before applying the change.
 */
export function canToggleActive(actor: User, target: User): boolean {
  if (actor.id === target.id) return false;
  return canEditUser(actor, target);
}

/** Visibility filter that the user list API applies to its query. */
export function listFilterRoles(actor: User): UserRole[] | null {
  if (actor.role === "SUPER_ADMIN") return null; // no filter — see all
  if (actor.role === "ADMIN") return ["ADMIN", "AGENT", "OPERATOR"];
  return [];
}
