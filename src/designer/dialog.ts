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
