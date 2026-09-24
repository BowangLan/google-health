"""Food format compatibility captured before extracting the original script."""

import copy
import unittest

from healthsync.records.food import Food

food = Food()


class FoodCompatibility(unittest.TestCase):
    def entry(self):
        return {
            "meal": "LUNCH",
            "name": "Burrito",
            "start": "2026-09-23T12:30:00-07:00",
            "kcal": 650,
            "carbs_g": 72,
            "fat_g": 24,
            "nutrients": {"PROTEIN": 38, "SODIUM": 0.48},
            "serving": {"amount": 2, "unit": "piece"},
        }

    def test_totals_are_not_scaled_by_servings(self):
        fm = self.entry()
        payload = food.fm_to_remote(fm)["nutritionLog"]
        self.assertEqual(payload["energy"]["kcal"], 650)
        self.assertEqual(payload["serving"]["amount"], 2)
        self.assertIn(
            {"nutrient": "SODIUM", "quantity": {"grams": 0.48}}, payload["nutrients"]
        )

    def test_round_trip_keeps_digest(self):
        fm = self.entry()
        payload = food.fm_to_remote(fm)
        payload["name"] = "users/me/dataTypes/nutrition-log/dataPoints/1234"
        result = food.remote_to_fm(payload)
        self.assertEqual(food.digest(fm), food.digest(result))
        self.assertEqual(fm["end"], "2026-09-23T12:31:00-07:00")

    def test_digest_excludes_metadata_and_keeps_legacy_value(self):
        fm = self.entry()
        self.assertEqual(food.digest(fm), "0d9ad1d90e3f9b14")
        other = copy.deepcopy(fm)
        other.update(id="1234", source="FITBIT", sync={"pulled": "now"})
        self.assertEqual(food.digest(fm), food.digest(other))
        other["kcal"] = 651
        self.assertNotEqual(food.digest(fm), food.digest(other))

    def test_identified_food_keeps_catalog_reference(self):
        fm = self.entry()
        fm["food_ref"] = "users/me/food/dataPoints/1234"
        payload = food.fm_to_remote(fm)["nutritionLog"]
        self.assertEqual(payload["food"], fm["food_ref"])
        self.assertNotIn("foodDisplayName", payload)

    def test_absent_empty_and_all_zero_nutrients_are_equivalent(self):
        fm = self.entry()
        fm.pop("nutrients")
        baseline = food.digest(fm)
        for nutrients in ({}, {"PROTEIN": 0}, {"IRON": 0, "PROTEIN": 0}):
            other = dict(fm, nutrients=nutrients)
            self.assertEqual(food.digest(other), baseline)
            self.assertEqual(food.diff(fm, other), [])
            self.assertEqual(other["nutrients"], nutrients)

    def test_nonzero_nutrient_change_is_still_dirty(self):
        fm = self.entry()
        fm["sync"] = {"digest": food.digest(fm)}
        fm["nutrients"]["PROTEIN"] = 39
        self.assertTrue(food.dirty(fm))


if __name__ == "__main__":
    unittest.main()
