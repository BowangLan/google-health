import { segmentedControlClassName } from "@/design-system/primitives/segmented-control";

// Shared form layout and states; utility strings remain visible to Tailwind's scanner.
export const numberInputClassName = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export const fieldClassName = [
  "field grid content-start gap-2 min-w-0 [&_>_span:first-child]:text-ui-label [&_>_span:first-child]:font-[560]",
  "[&_>_span:first-child]:text-muted-foreground [&_>_span:first-child]:leading-4 [&_.hint]:text-ui-caption [&_.hint]:text-subtle",
  "[&_.hint]:leading-[1.6] [&_.seg]:min-h-10 [&_.seg]:items-stretch [&_.seg]:flex [&_.seg]:ml-0 [&_.seg_button]:[flex:1] [&_.seg_button]:min-w-0",
  "[&_.seg_button]:py-1.5 [&_.seg_button]:px-2 [&_.seg_button]:leading-4 max-[761px]:[&_.seg_button]:py-1.5 max-[761px]:[&_.seg_button]:px-1",
  "max-[761px]:[&_.seg_button]:text-ui-caption max-[761px]:[&_.seg]:min-h-11"
].join(" ");

export const formClassName = [
  "fields grid gap-4.5 p-6 [&_.fields]:[padding:16px_0_0] [&_>_.buttons]:[padding:6px_0_0] [&_>_.buttons]:gap-2.5 max-[761px]:p-5"
].join(" ");

export const segmentedClassName = segmentedControlClassName;
