// Shared form layout and states; utility strings remain visible to Tailwind's scanner.
export const fieldClassName = [
  "field grid gap-[7px] min-w-0 [&_>_span:first-child]:text-[12px] [&_>_span:first-child]:font-[560]",
  "[&_>_span:first-child]:text-muted-foreground [&_.hint]:text-[11px] [&_.hint]:text-subtle",
  "[&_.hint]:leading-[1.6] [&_.seg]:flex [&_.seg]:ml-0 [&_.seg_button]:[flex:1] [&_.seg_button]:min-w-0",
  "[&_.seg_button]:py-1.5 [&_.seg_button]:px-2 max-[761px]:[&_.seg_button]:py-1.5 max-[761px]:[&_.seg_button]:px-1",
  "max-[761px]:[&_.seg_button]:text-[11px]"
].join(" ");

export const formClassName = [
  "fields grid gap-4 p-5.5 [&_.fields]:[padding:16px_0_0] [&_>_.buttons]:[padding:4px_0_0] max-[761px]:p-4.5"
].join(" ");

export const segmentedClassName = [
  "seg inline-flex ml-auto p-0.5 rounded-full [background:rgb(255_255_255_/_0.05)] border border-solid",
  "border-border [&_button]:min-w-[42px] [&_button]:py-[5px] [&_button]:px-3 [&_button]:border-0",
  "[&_button]:rounded-full [&_button]:bg-transparent [&_button]:text-muted-foreground [&_button]:text-[12px]",
  "[&_button]:font-[590] [&_button[aria-pressed=true]]:bg-secondary [&_button[aria-pressed=true]]:text-foreground",
  "[&_button[aria-pressed=true]]:shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08),_0_1px_4px_rgb(0_0_0_/_0.4)]",
  "pointer-hover:[&_button:hover:not([aria-pressed=true])]:text-foreground max-[381px]:[&_button]:min-w-0",
  "max-[381px]:[&_button]:py-[5px] max-[381px]:[&_button]:px-[9px]"
].join(" ");
