# Three fresh dark-mode product concepts

Question: what does the person want to accomplish when opening the app?
The previous Ledger/Pulse/Atlas structure was rejected. These concepts start
from jobs and decisions, rather than organizing the app around record browsing
and historical charts. Three sub-agents independently designed each direction.

From the repository root:

```sh
bun run design
```

| Concept | Open | User's job | Primary interaction |
| --- | --- | --- | --- |
| D · Capture | [Preview](http://127.0.0.1:5174/?prototype=1&variant=D) | I ate something; help me record it quickly and correctly. | Search familiar foods, adjust a portion with nutrition visible, then review and save. Saved receipts provide feedback rather than define the whole app. |
| E · Next | [Preview](http://127.0.0.1:5174/?prototype=1&variant=E) | Help me choose my next meal within my own targets. | Compare sample meal options, adjust the plate, see its effect on remaining calories and macros, and open an editable logging draft. Planning and logging are separate. |
| F · Ritual | [Preview](http://127.0.0.1:5174/?prototype=1&variant=F) | Help me build a small health routine I can keep. | Choose a routine, attach it to an everyday cue, set a frequency, then check in. Recording food/weight and manually marking a routine done remain distinct. |

All screens, forms, and comparison controls use dark mode. Each direction has
its own layout and visual system. The floating selector switches concepts while
retaining sample records, the selected date, and range. Left/right arrow keys
also switch when focus is outside forms and interactive visualizations.

## Prototype scope

Data and interactions stay in memory. Fixtures are anchored to October 3, 2026;
reload or Reset restores them. Food entry supports search, manual entry,
editable amount/unit, calories and all three macros, reuse, edit, and delete.
Weight entry uses an explicit pounds/kilograms selector. Sync is simulated;
there are no account connections, API calls, or Google Health writes.

Meal choices are illustrative options, not a personalized recommendation system.
Routines and check-ins are local preview state. The purpose is to evaluate
information hierarchy and interaction design, not validate nutritional advice.
No concept has been selected for production. Shared sample data and forms are
reused; the three primary surfaces are newly designed.

Screenshots and a local comparison gallery are saved in
`docs/design-refs/new-concepts/`, an intentionally Git-ignored reference directory.
Prior-round screenshots remain in `docs/design-refs/web-designs/` for provenance.

The development gate excludes these prototypes from the production build.
Promote a selected concept through the production components and data contract
once its behavior is agreed; prototype components are review artifacts.

## Validation

Typecheck and production build pass. Browser checks cover all three concepts at
1440px desktop and 390px mobile: dark color scheme, no horizontal overflow,
no browser errors, no old navigation concepts, and no API requests.

Interaction checks exercised Capture search, portion scaling, review, edit,
reuse and kg entry; Next choice, portion/side totals, keeping versus logging a
plan and selected-date handoff; and Ritual setup, recording, independent Done/Skip,
future commitments, pause/resume, changing routines, and simulated sync.
