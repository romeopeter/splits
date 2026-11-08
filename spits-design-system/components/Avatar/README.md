Shows who is in the project. `AvatarStack` overlaps up to four people in the top bar.

**Provide:** `name` (required; initials come from it), optional `src`, `color` as a collaborator token (`collab-1` … `collab-4`), `size` (default 28).

**Use:** assign each person one collaborator colour for the session and reuse it on their CursorLabel. Initials are `text-on-accent` on the fill (4.5:1 or better in both themes). Beyond four people, show a "+3" count.

**Accessibility:** each avatar is an image with the person's name; the stack is a labelled group.
