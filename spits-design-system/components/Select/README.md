Chooses one value from a short list: font family, weight, playback speed, canvas zoom.

**Provide:** `label` (required, the accessible name), `value`, `options` (strings or `{value,label}`), `onChange`.

**Use:** the native `<select>` so keyboard, type-ahead and mobile pickers work; the chevron is decorative. For more than about 12 options, or search, build a combobox instead.

**Don't:** use Select for two or three mutually exclusive options that fit in a row (use SegmentedControl).
