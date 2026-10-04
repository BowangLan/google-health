import { MEALS, MEAL_NAME } from "@/lib/format";
import { Segmented } from "@/components/forms/segmented";

export function MealPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Segmented
      label="Meal"
      options={MEALS}
      value={value as (typeof MEALS)[number]}
      onChange={onChange}
      titles={MEAL_NAME}
      className="max-[381px]:[&_.seg_button]:px-0.5 max-[381px]:[&_.seg_button:first-child]:[flex:1.35] max-[381px]:[&_.seg_button:last-child]:[flex:1.2]"
    />
  );
}
