import { Widget } from "scripting"
import { launchApp } from "./index"
import { launchWidget } from "./widget"

declare const __SINGLE_FILE_BUNDLE__: boolean | undefined

if (Widget?.family) {
  void launchWidget()
} else if (typeof __SINGLE_FILE_BUNDLE__ !== "undefined" && __SINGLE_FILE_BUNDLE__) {
  void launchApp()
}
