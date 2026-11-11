/**
 * Icons are Phosphor (regular weight), the app's only icon family
 * (AGENTS.md, settled 2026-11-11). Components ask for an icon by a Split
 * name; this table maps each name to its Phosphor glyph, so swapping a
 * glyph is a one-line change and a misspelt name fails the type check.
 *
 * Each icon is imported from its own module, so the dev server never loads
 * Phosphor's whole barrel.
 */
import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react/dist/lib/types";
import { ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { ArrowsInLineHorizontal } from "@phosphor-icons/react/dist/csr/ArrowsInLineHorizontal";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretLineLeft } from "@phosphor-icons/react/dist/csr/CaretLineLeft";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { ClosedCaptioning } from "@phosphor-icons/react/dist/csr/ClosedCaptioning";
import { Cursor } from "@phosphor-icons/react/dist/csr/Cursor";
import { DotsSixVertical } from "@phosphor-icons/react/dist/csr/DotsSixVertical";
import { Export } from "@phosphor-icons/react/dist/csr/Export";
import { Eye } from "@phosphor-icons/react/dist/csr/Eye";
import { EyeSlash } from "@phosphor-icons/react/dist/csr/EyeSlash";
import { FilmStrip } from "@phosphor-icons/react/dist/csr/FilmStrip";
import { FolderSimplePlus } from "@phosphor-icons/react/dist/csr/FolderSimplePlus";
import { GearSix } from "@phosphor-icons/react/dist/csr/GearSix";
import { Hand } from "@phosphor-icons/react/dist/csr/Hand";
import { Image } from "@phosphor-icons/react/dist/csr/Image";
import { Info } from "@phosphor-icons/react/dist/csr/Info";
import { List } from "@phosphor-icons/react/dist/csr/List";
import { LockSimple } from "@phosphor-icons/react/dist/csr/LockSimple";
import { LockSimpleOpen } from "@phosphor-icons/react/dist/csr/LockSimpleOpen";
import { MagnifyingGlassPlus } from "@phosphor-icons/react/dist/csr/MagnifyingGlassPlus";
import { Microphone } from "@phosphor-icons/react/dist/csr/Microphone";
import { Minus } from "@phosphor-icons/react/dist/csr/Minus";
import { MusicNotes } from "@phosphor-icons/react/dist/csr/MusicNotes";
import { Pause } from "@phosphor-icons/react/dist/csr/Pause";
import { PictureInPicture } from "@phosphor-icons/react/dist/csr/PictureInPicture";
import { Play } from "@phosphor-icons/react/dist/csr/Play";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Question } from "@phosphor-icons/react/dist/csr/Question";
import { Scissors } from "@phosphor-icons/react/dist/csr/Scissors";
import { SelectionBackground } from "@phosphor-icons/react/dist/csr/SelectionBackground";
import { Shapes } from "@phosphor-icons/react/dist/csr/Shapes";
import { ShareNetwork } from "@phosphor-icons/react/dist/csr/ShareNetwork";
import { SkipBack } from "@phosphor-icons/react/dist/csr/SkipBack";
import { SkipForward } from "@phosphor-icons/react/dist/csr/SkipForward";
import { SlidersHorizontal } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { Smiley } from "@phosphor-icons/react/dist/csr/Smiley";
import { Sparkle } from "@phosphor-icons/react/dist/csr/Sparkle";
import { SpeakerHigh } from "@phosphor-icons/react/dist/csr/SpeakerHigh";
import { SpeakerSlash } from "@phosphor-icons/react/dist/csr/SpeakerSlash";
import { TextAlignCenter } from "@phosphor-icons/react/dist/csr/TextAlignCenter";
import { TextAlignJustify } from "@phosphor-icons/react/dist/csr/TextAlignJustify";
import { TextAlignLeft } from "@phosphor-icons/react/dist/csr/TextAlignLeft";
import { TextAlignRight } from "@phosphor-icons/react/dist/csr/TextAlignRight";
import { TextT } from "@phosphor-icons/react/dist/csr/TextT";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { Warning } from "@phosphor-icons/react/dist/csr/Warning";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { X } from "@phosphor-icons/react/dist/csr/X";

/** Split name -> Phosphor glyph. The transport and grip glyphs are filled, as the design system asks. */
const ICONS = {
  // Panels and tools
  media: [FolderSimplePlus],
  video: [FilmStrip],
  audio: [MusicNotes],
  music: [MusicNotes],
  voice: [Microphone],
  text: [TextT],
  emoji: [Smiley],
  captions: [ClosedCaptioning],
  effects: [Sparkle],
  motion: [Sparkle],
  adjust: [SlidersHorizontal],
  cutout: [SelectionBackground],
  overlay: [PictureInPicture],
  shapes: [Shapes],
  image: [Image],
  settings: [GearSix],
  help: [Question],
  select: [Cursor],
  pan: [Hand],
  split: [Scissors],
  trim: [ArrowsInLineHorizontal],
  // Actions
  add: [Plus],
  plus: [Plus],
  minus: [Minus],
  "zoom-in": [MagnifyingGlassPlus],
  undo: [ArrowCounterClockwise],
  redo: [ArrowClockwise],
  trash: [Trash],
  export: [Export],
  share: [ShareNetwork],
  close: [X],
  menu: [List],
  collapse: [CaretLineLeft],
  "chevron-down": [CaretDown],
  "align-left": [TextAlignLeft],
  "align-center": [TextAlignCenter],
  "align-right": [TextAlignRight],
  "align-justify": [TextAlignJustify],
  // Toggles
  eye: [Eye],
  "eye-off": [EyeSlash],
  lock: [LockSimple],
  unlock: [LockSimpleOpen],
  volume: [SpeakerHigh],
  "volume-off": [SpeakerSlash],
  // Status: always beside a word
  check: [Check],
  info: [Info],
  warning: [Warning],
  alert: [WarningCircle],
  // Transport and grip
  play: [Play, "fill"],
  pause: [Pause, "fill"],
  "skip-back": [SkipBack, "fill"],
  "skip-forward": [SkipForward, "fill"],
  grip: [DotsSixVertical, "bold"],
} satisfies Record<string, [PhosphorIcon] | [PhosphorIcon, IconWeight]>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  /** Only when the icon stands alone and carries meaning. */
  title?: string;
  className?: string;
}

export function Icon({ name, size = 20, title, className }: IconProps) {
  const [Glyph, weight = "regular"] = ICONS[name] as [PhosphorIcon, IconWeight?];
  return (
    <Glyph
      className={["sp-icon", className].filter(Boolean).join(" ")}
      size={size}
      weight={weight}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    />
  );
}
