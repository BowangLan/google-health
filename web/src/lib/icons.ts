// The only module that imports the icon library, so swapping a glyph is a
// one-line change here rather than a search across components.
//
// Deep imports: the barrel makes Vite pre-bundle 3,000+ modules on a cold
// start. Names carry the `Icon` suffix because the bare exports are
// deprecated in v2.1 and go away in v3.
//
// One weight (regular, which lands on exactly 1px at 16px and so matches the
// app's hairlines) and three sizes (14 / 16 / 20) are set once in App via
// IconContext. Never pass `color`: currentColor lets an icon inherit its
// button's hover and disabled states for free.

export { CaretLeftIcon as IconPrev } from "@phosphor-icons/react/CaretLeft";
export { CaretRightIcon as IconNext } from "@phosphor-icons/react/CaretRight";
export { GearIcon as IconSettings } from "@phosphor-icons/react/Gear";
export { PlusIcon as IconAdd } from "@phosphor-icons/react/Plus";
export { XIcon as IconClose } from "@phosphor-icons/react/X";
export { PencilSimpleIcon as IconEdit } from "@phosphor-icons/react/PencilSimple";
export { TrashIcon as IconDelete } from "@phosphor-icons/react/Trash";
export { ArrowCounterClockwiseIcon as IconAgain } from "@phosphor-icons/react/ArrowCounterClockwise";
// Provenance, not approval: this food came from Google's catalogue, so its
// nutrition may be recomputed from that reference. The title text carries the
// meaning; no 14px glyph can.
export { DatabaseIcon as IconCatalogue } from "@phosphor-icons/react/Database";
export { CalendarBlankIcon as IconLedger } from "@phosphor-icons/react/CalendarBlank";
export { ChartLineIcon as IconTrends } from "@phosphor-icons/react/ChartLine";
export { ScalesIcon as IconWeight } from "@phosphor-icons/react/Scales";
export { ForkKnifeIcon as IconFood } from "@phosphor-icons/react/ForkKnife";
export { WarningIcon as IconWarning } from "@phosphor-icons/react/Warning";
export { ArrowsClockwiseIcon as IconSync } from "@phosphor-icons/react/ArrowsClockwise";
