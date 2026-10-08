import { Segmented } from "@/design-system/patterns/segmented";

export function UnitPicker({ value, onChange }: { value: "kg" | "lb"; onChange: (value: "kg" | "lb") => void }) {
  return <Segmented label="Unit" options={["kg", "lb"] as const} value={value} onChange={onChange} />;
}
