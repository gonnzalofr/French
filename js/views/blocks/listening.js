import { h, extLink, autosaveField, tag, fill } from "../../dom.js";
import { findById } from "../../content.js";
import { parseWords, pickAnother } from "../../day.js";

const TYPE_LABEL = { podcast: "podcast", youtube: "YouTube", radio: "radio", show: "video" };

export function listeningBlock({ content, day, state, iso, save, onCleanup }) {
  const L = day.blocks.listening;
  const pickBox = h("div", { class: "pick" });

  function paintPick() {
    const item = findById(content.podcasts.items, L.itemId);
    fill(pickBox,
      h(
        "div",
        { class: "pick-title" },
        extLink(item.name, item.url, { verify: item.verify }),
        tag(item.level),
        tag(TYPE_LABEL[item.type], "tag-plain"),
      ),
      item.notes ? h("p", { class: "muted" }, item.notes) : null,
      h(
        "p",
        {},
        h(
          "button",
          {
            type: "button",
            class: "btn btn-small",
            onclick: () => {
              pickAnother(state, iso, "podcast", content);
              save();
              paintPick();
            },
          },
          "Pick another",
        ),
      ),
    );
  }
  paintPick();

  const count = h("p", { class: "field-hint muted", "aria-live": "polite" });
  const paintCount = (n) => {
    count.textContent = `${n} noted · aim for 3–5`;
  };
  const words = autosaveField({
    id: `words-${iso}`,
    label: "New words and phrases",
    hint: "One per line. Add a meaning after = if you want it on an Anki card, e.g. avoir du mal à = to struggle to",
    value: L.words.join("\n"),
    rows: 5,
    onInput: (v) => paintCount(parseWords(v).length),
    onSave: (v) => {
      L.words = parseWords(v);
      save();
    },
  });
  onCleanup(words.dispose);
  paintCount(L.words.length);

  return h(
    "div",
    {},
    pickBox,
    h("p", { class: "muted" }, "Listen once for the gist, then replay a hard 2-minute stretch and note what you catch."),
    words.el,
    count,
  );
}
