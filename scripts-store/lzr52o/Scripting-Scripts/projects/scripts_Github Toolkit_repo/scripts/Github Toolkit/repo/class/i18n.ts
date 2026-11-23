// Re-export of the shared i18n helper (components/i18n.ts). The Repository
// module used to own the only copy; since v1.2.0 every module (Actions,
// Gist, Repository, the shared components) uses the same t() / getLang() /
// LANG, so the implementation lives in one place and this file just keeps
// the old import path (`../class/i18n`) working for the Repository pages.
export * from "../../components/i18n";
