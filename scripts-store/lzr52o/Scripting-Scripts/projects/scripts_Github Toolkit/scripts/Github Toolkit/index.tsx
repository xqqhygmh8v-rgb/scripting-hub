// Script entry point. The app itself lives in app.tsx so the Home Screen
// component (home_screen_default_ui.tsx) renders exactly the same tool.
import { Navigation, Script } from "scripting";
import { GitHubToolkitApp } from "./app";

async function run() {
  await Navigation.present({ element: <GitHubToolkitApp />, modalPresentationStyle: "overFullScreen" });
  Script.exit();
}

run();
