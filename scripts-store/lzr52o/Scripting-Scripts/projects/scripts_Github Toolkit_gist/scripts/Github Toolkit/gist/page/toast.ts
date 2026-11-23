let _toastTrigger: (() => void) | null = null;

export function registerToast(trigger: () => void) {
  _toastTrigger = trigger;
}

export function showToast() {
  _toastTrigger?.();
}
