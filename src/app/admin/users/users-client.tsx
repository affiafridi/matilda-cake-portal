"use client";

import { useEffect, useState, type FormEvent } from "react";

type UserRole = "SUPER_ADMIN" | "ADMIN" | "CHEF" | "COORDINATOR";

type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Actor = { id: string; role: UserRole };

const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  CHEF: "Chef",
  COORDINATOR: "Coordinator",
};

const inputCls =
  "block w-full rounded-xl border border-rule bg-canvas px-3 py-2 text-base sm:text-sm text-ink focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30";

export default function UsersClient({
  actor,
  assignableRoles,
}: {
  actor: Actor;
  assignableRoles: UserRole[];
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: User[] }
        | { ok: false; error: string }
        | null;
      if (json && json.ok) setUsers(json.data);
      else setError((json && !json.ok && json.error) || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          {loading ? "Loading…" : `${users.length} user${users.length === 1 ? "" : "s"}`}
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          + New user
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-rule bg-white">
        {/* Table view ≥ sm */}
        <table className="hidden w-full text-sm sm:table">
          <thead className="bg-canvas text-left text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                actor={actor}
                assignableRoles={assignableRoles}
                onChanged={refresh}
              />
            ))}
            {users.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-ink-muted"
                >
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Card view < sm */}
        <ul className="divide-y divide-rule sm:hidden">
          {users.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              actor={actor}
              assignableRoles={assignableRoles}
              onChanged={refresh}
            />
          ))}
        </ul>
      </div>

      {creating && (
        <CreateUserDialog
          assignableRoles={assignableRoles}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ----------------- Row / Card -----------------

function UserRow({
  user,
  actor,
  assignableRoles,
  onChanged,
}: {
  user: User;
  actor: Actor;
  assignableRoles: UserRole[];
  onChanged: () => void;
}) {
  const isSelf = actor.id === user.id;
  const editable =
    actor.role === "SUPER_ADMIN" || user.role !== "SUPER_ADMIN";

  return (
    <tr>
      <td className="px-4 py-3 font-medium text-ink">
        {user.name}
        {isSelf && (
          <span className="ml-2 text-xs font-normal text-ink-muted">(you)</span>
        )}
      </td>
      <td className="px-4 py-3 text-ink-muted">{user.email}</td>
      <td className="px-4 py-3 text-ink">{ROLE_LABEL[user.role]}</td>
      <td className="px-5 py-3">
        <span
          className={
            user.isActive
              ? "inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success"
              : "inline-flex items-center gap-1.5 rounded-full bg-ink-muted/10 px-2.5 py-0.5 text-xs font-medium text-ink-muted"
          }
        >
          {user.isActive ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <RowActions
          user={user}
          actor={actor}
          assignableRoles={assignableRoles}
          editable={editable}
          onChanged={onChanged}
        />
      </td>
    </tr>
  );
}

function UserCard({
  user,
  actor,
  assignableRoles,
  onChanged,
}: {
  user: User;
  actor: Actor;
  assignableRoles: UserRole[];
  onChanged: () => void;
}) {
  const isSelf = actor.id === user.id;
  const editable =
    actor.role === "SUPER_ADMIN" || user.role !== "SUPER_ADMIN";

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-ink">
            {user.name}
            {isSelf && (
              <span className="ml-2 text-xs font-normal text-ink-muted">
                (you)
              </span>
            )}
          </div>
          <div className="text-xs text-ink-muted">{user.email}</div>
        </div>
        <span
          className={
            user.isActive
              ? "shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
              : "shrink-0 rounded-full bg-ink-muted/10 px-2 py-0.5 text-xs font-medium text-ink-muted"
          }
        >
          {user.isActive ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="text-xs text-ink-muted">{ROLE_LABEL[user.role]}</div>
      <RowActions
        user={user}
        actor={actor}
        assignableRoles={assignableRoles}
        editable={editable}
        onChanged={onChanged}
      />
    </li>
  );
}

function RowActions({
  user,
  actor,
  assignableRoles,
  editable,
  onChanged,
}: {
  user: User;
  actor: Actor;
  assignableRoles: UserRole[];
  editable: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete =
    actor.role === "SUPER_ADMIN" && actor.id !== user.id;

  async function toggleActive() {
    if (!editable || actor.id === user.id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Update failed.");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!editable) {
    return (
      <span className="text-xs text-ink-muted">View-only</span>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-xl border border-rule px-2.5 py-1 font-medium text-ink hover:bg-cream/60"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setResetting(true)}
          className="rounded-xl border border-rule px-2.5 py-1 font-medium text-ink hover:bg-cream/60"
        >
          Reset password
        </button>
        {actor.id !== user.id && (
          <button
            type="button"
            onClick={toggleActive}
            disabled={busy}
            className={
              user.isActive
                ? "rounded-xl border border-danger/30 px-2.5 py-1 font-medium text-danger hover:bg-danger/5 disabled:opacity-60"
                : "rounded-xl border border-success/30 px-2.5 py-1 font-medium text-success hover:bg-success/5 disabled:opacity-60"
            }
          >
            {user.isActive ? "Deactivate" : "Activate"}
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="rounded-xl border border-danger/40 bg-danger/5 px-2.5 py-1 font-medium text-danger hover:bg-danger/10"
          >
            Delete
          </button>
        )}
      </div>
      {error && (
        <p className="mt-1 text-right text-xs text-danger">{error}</p>
      )}
      {editing && (
        <EditUserDialog
          user={user}
          assignableRoles={assignableRoles}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
      {resetting && (
        <ResetPasswordDialog
          user={user}
          onClose={() => setResetting(false)}
          onDone={() => setResetting(false)}
        />
      )}
      {deleting && (
        <DeleteUserDialog
          user={user}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function DeleteUserDialog({
  user,
  onClose,
  onDeleted,
}: {
  user: User;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = confirmText.trim().toUpperCase() === "DELETE";

  async function handleDelete() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Delete failed.");
        return;
      }
      onDeleted();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Delete ${user.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-ink">
          This permanently removes <strong>{user.name}</strong>{" "}
          ({user.email}) from the system. Their sessions are revoked. Any
          past orders or status updates they touched are kept, but no
          longer show their name as the creator / chef.
        </p>
        <p className="text-sm font-medium text-danger">
          This cannot be undone.
        </p>
        <FieldRow label="Type DELETE to confirm">
          <input
            type="text"
            className={inputCls}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoFocus
          />
        </FieldRow>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted hover:bg-cream/60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canSubmit || submitting}
            className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Deleting…" : "Delete user"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ----------------- Dialogs -----------------

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-rule bg-white p-5 shadow-xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ink-muted hover:bg-cream/60"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateUserDialog({
  assignableRoles,
  onClose,
  onCreated,
}: {
  assignableRoles: UserRole[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>(
    assignableRoles.includes("COORDINATOR")
      ? "COORDINATOR"
      : assignableRoles[0],
  );
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          role,
          password,
          isActive: true,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Could not create user.");
        return;
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New user" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <FieldRow label="Name">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </FieldRow>
        <FieldRow label="Email">
          <input
            type="email"
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </FieldRow>
        <FieldRow label="Phone (optional)">
          <input
            className={inputCls}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </FieldRow>
        <FieldRow label="Role">
          <select
            className={inputCls}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            {assignableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Initial password">
          <input
            type="text"
            className={inputCls}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Min 8 · upper, lower, number, special"
          />
        </FieldRow>
        {error && (
          <p className="text-sm text-danger">{error}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted hover:bg-cream/60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserDialog({
  user,
  assignableRoles,
  onClose,
  onSaved,
}: {
  user: User;
  assignableRoles: UserRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [role, setRole] = useState<UserRole>(user.role);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the current role isn't in our assignable list (e.g. SUPER_ADMIN
  // editing themselves), keep it pinned in the dropdown so the form still
  // submits without a forced change.
  const roleOptions = assignableRoles.includes(role)
    ? assignableRoles
    : [...assignableRoles, role];

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          role,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Update failed.");
        return;
      }
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Edit ${user.name}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <FieldRow label="Name">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </FieldRow>
        <FieldRow label="Email">
          <input className={inputCls} value={user.email} disabled />
        </FieldRow>
        <FieldRow label="Phone">
          <input
            className={inputCls}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </FieldRow>
        <FieldRow label="Role">
          <select
            className={inputCls}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </FieldRow>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted hover:bg-cream/60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  onDone,
}: {
  user: User;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/users/${user.id}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Reset failed.");
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Reset password — ${user.name}`} onClose={onClose}>
      {done ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            Password updated. The user has been signed out everywhere and
            must sign in again with the new password.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onDone}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <FieldRow label="New password">
            <input
              type="text"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Min 8 · upper, lower, number, special"
            />
          </FieldRow>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted hover:bg-cream/60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {submitting ? "Updating…" : "Reset password"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
