/** One accessible in-app authoring dialog; native focus containment and Escape. */
export function createSlotDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "slot-dialog";
  dialog.setAttribute("aria-labelledby", "slot-dialog-title");
  dialog.setAttribute("aria-describedby", "slot-dialog-description");
  const form = document.createElement("form");
  form.method = "dialog";
  const title = document.createElement("h2");
  title.id = "slot-dialog-title";
  const description = document.createElement("p");
  description.id = "slot-dialog-description";
  const label = document.createElement("label");
  label.textContent = "Name";
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 80;
  input.autocomplete = "off";
  label.append(input);
  const actions = document.createElement("div");
  actions.className = "slot-dialog-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.onclick = () => dialog.close("cancel");
  const confirm = document.createElement("button");
  confirm.type = "submit";
  confirm.textContent = "Save";
  actions.append(cancel, confirm);
  form.append(title, description, label, actions);
  dialog.append(form);
  document.body.append(dialog);
  form.onsubmit = (event) => {
    event.preventDefault();
    if (!label.hidden && !input.value.trim()) {
      input.focus();
      return;
    }
    dialog.close("confirm");
  };
  return (options: {
    title: string;
    description: string;
    name?: string;
    action: string;
  }): Promise<string | undefined> => {
    const prior = document.activeElement as HTMLElement | null;
    title.textContent = options.title;
    description.textContent = options.description;
    label.hidden = options.name === undefined;
    input.required = !label.hidden;
    input.value = options.name ?? "";
    confirm.textContent = options.action;
    dialog.returnValue = "cancel";
    return new Promise((resolve) => {
      dialog.addEventListener(
        "close",
        () => {
          prior?.focus();
          resolve(
            dialog.returnValue === "confirm"
              ? label.hidden
                ? "confirm"
                : input.value.trim()
              : undefined,
          );
        },
        { once: true },
      );
      dialog.showModal();
      if (label.hidden) cancel.focus();
      else {
        input.focus();
        input.select();
      }
    });
  };
}

/**
 * Slot options menu (long-press on touch screens): the touch equivalent of
 * Shift+click (replace) and × / Delete (remove a saved slot).
 */
export function createSlotMenu() {
  const dialog = document.createElement("dialog");
  dialog.className = "slot-dialog slot-menu";
  dialog.setAttribute("aria-labelledby", "slot-menu-title");
  dialog.innerHTML = `<form method="dialog">
    <h2 id="slot-menu-title"></h2>
    <p></p>
    <div class="slot-menu-actions">
      <button value="replace">Replace with current design</button>
      <button value="delete" class="slot-menu-delete">Delete</button>
      <button value="cancel">Cancel</button>
    </div>
  </form>`;
  document.body.append(dialog);
  const title = dialog.querySelector("h2")!;
  const description = dialog.querySelector("p")!;
  const remove = dialog.querySelector<HTMLButtonElement>('[value="delete"]')!;
  return (options: {
    title: string;
    description: string;
    canDelete: boolean;
  }): Promise<"replace" | "delete" | undefined> => {
    const prior = document.activeElement as HTMLElement | null;
    title.textContent = options.title;
    description.textContent = options.description;
    remove.hidden = !options.canDelete;
    dialog.returnValue = "cancel";
    return new Promise((resolve) => {
      dialog.addEventListener(
        "close",
        () => {
          prior?.focus();
          const choice = dialog.returnValue;
          resolve(choice === "replace" || choice === "delete" ? choice : undefined);
        },
        { once: true },
      );
      dialog.showModal();
    });
  };
}

/**
 * Long-press (touch or pen, 500 ms without moving) runs `action`; the click that
 * ends the press is swallowed so the slot is not also loaded. Mouse users keep
 * Shift+click and ×; the browser's own long-press callout/menu is suppressed.
 */
export function onLongPress(target: HTMLElement, action: () => void, delayMs = 500) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start = { x: 0, y: 0 };
  let fired = false;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  target.addEventListener("pointerdown", (event) => {
    fired = false;
    if (event.pointerType === "mouse") return;
    start = { x: event.clientX, y: event.clientY };
    cancel();
    timer = setTimeout(() => {
      timer = undefined;
      fired = true;
      navigator.vibrate?.(10);
      action();
    }, delayMs);
  });
  target.addEventListener("pointermove", (event) => {
    if (timer && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancel();
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"])
    target.addEventListener(type, cancel);
  target.addEventListener("contextmenu", (event) => event.preventDefault());
  // Capture listeners on the target run before its onclick handler.
  target.addEventListener(
    "click",
    (event) => {
      if (!fired) return;
      fired = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
}
