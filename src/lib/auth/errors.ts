/**
 * Auth-layer error types. Kept in a standalone file (no `server-only`
 * directive, no Node-only imports) so both server modules and the
 * shared API util can `import` it without triggering build splits.
 */
export class AuthError extends Error {
  status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}
