// Scripting Home Screen entry point. The host discovers this conventional
// filename and embeds its default export directly in the Home tab.
//
// Previously this rendered only a static logo + "GitHub Toolkit" subtitle,
// so after adding the script to the Home tab the page showed the logo and
// nothing operable (see the screenshot: black page, no list, no buttons).
// A Home Screen component is not a widget: hooks, List, NavigationLink,
// Button and TextField all work here, so render the full tool instead —
// the same GitHubToolkitApp that index.tsx presents, in embedded mode
// (no presented sheet to dismiss, no Script.exit, no exit button).
import { GitHubToolkitApp } from "./app";

export default function GitHubToolkitHomeScreen() {
  return <GitHubToolkitApp embedded />;
}
