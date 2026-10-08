import { fieldClassName } from "@/design-system/patterns/form-styles";
import { SegmentedControl, type SegmentedControlProps } from "@/design-system/primitives/segmented-control";
import { cn } from "@/design-system/lib/cn";

/** A labeled selection field; the lower-level control also works in toolbars. */
export function Segmented<T extends string>({ className, ...props }: SegmentedControlProps<T>) {
  return <div className={cn(fieldClassName, className)}><span>{props.label}</span><SegmentedControl {...props} /></div>;
}
