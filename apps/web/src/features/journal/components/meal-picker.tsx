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
    />
  );
}
