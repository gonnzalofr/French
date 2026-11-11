import { h, autosaveField } from "../../dom.js";

export function logBlock({ state, day, iso, save, onCleanup }) {
  const log = day.blocks.log;

  // Close the loop: show what you said to fix last time.
  const previous = Object.keys(state.days)
    .filter((d) => d < iso && state.days[d].blocks?.log?.fixNext?.trim())
    .sort()
    .at(-1);

  const fields = [
    { key: "wentWell", label: "What went well", placeholder: "e.g. understood most of the RFI bulletin without the transcript" },
    { key: "fixNext", label: "What to fix next time", placeholder: "e.g. kept saying « je suis allé » with avoir" },
  ].map(({ key, label, placeholder }) => {
    const f = autosaveField({
      id: `log-${key}-${iso}`,
      label,
      placeholder,
      value: log[key],
      rows: 2,
      onSave: (v) => {
        log[key] = v;
        save();
      },
    });
    onCleanup(f.dispose);
    return f.el;
  });

  return h(
    "div",
    {},
    previous
      ? h(
          "p",
          { class: "callout" },
          h("strong", {}, `Last time (${previous}) you wanted to fix: `),
          state.days[previous].blocks.log.fixNext,
        )
      : null,
    fields,
  );
}
