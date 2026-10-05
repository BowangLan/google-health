# Google Health web dashboard: UI AST Layer 2

Source snapshot: October 4, 2026. This describes the production dashboard in
`apps/web/src/app/app.tsx` and `apps/web/src/app/routes/dashboard.tsx`, including
the journal, trends, sync, settings, and activity components they open.

This is a source-derived description, not a browser capture. Geometry comes
from the current layout rules. No patient records or sample nutrition values
are embedded. The Capture, Next, and Ritual prototypes are outside this document.

## Reading the tree

The notation follows [UI AST v0.1](../../ui-ast/SPEC.md). One `Page` contains the
wide-screen dashboard and its alternate states and modal dialogs. `when` paths
name observable states; they are descriptive references, not executable tests.
Normal content and alternate states are listed together for documentation.

`app`, `day`, `trends`, `calendar`, `foodDraft`, `weightDraft`, `record`, `edit`,
`deletion`, `sync`, `settings`, `activity`, and `shortcuts` are document-global
presentation references. Fields inside collection items resolve against that
item. Paths describe the information visible on screen, rather than prescribe
an application data schema. `label`, `action`, and `destination` name existing
affordances; the referenced actions are explained after the tree.

Time and numeric entry use `TextInput` with the existing field labels because
v0.1 has no time-input or number-input primitive. Their input constraints are
recorded below. Segmented choices retain their visible button composition.
`Chart kind` values name the observed chart forms; v0.1 leaves this vocabulary
open. The rings use one concentric progress chart, with their values alongside
it. `Accordion` represents the existing native disclosure controls.

## Dashboard and reachable dialogs

```jsx
<Page id="health-dashboard" scroll="vertical">
  <Section when="app.keyboardSkipLinkVisible">
    <Link destination="main-content">Skip to content</Link>
  </Section>

  <Header id="app-topbar" position="sticky" top={0} height={56} paddingX={32}>
    <Row width="fill" height="fill" justify="between">
      <Link destination="dashboard-today">Health</Link>
      <TopNav id="utilities">
        <Row gap={2}>
          <IconButton icon="activity" label="Activity" action="open-activity" controls="activity-dialog" />
          <IconButton icon="settings" label="Settings" action="open-settings" controls="settings-dialog" />
          <IconButton icon="keyboard" label="Shortcuts" action="open-shortcuts" controls="shortcuts-dialog" />
        </Row>
      </TopNav>
    </Row>
    <Panel id="sync-status" label="Google Health sync" position="floating" anchor="app-topbar" placement="center" width={236}>
      <Button action="open-sync" label="Google Health sync" controls="sync-dialog" expanded="sync.dialogOpen" busy="app.operationRunning">
        <Row gap={8}>
          <Icon icon="sync-status" label="Sync status" />
          <Text field="sync.statusLabel" />
          <Text kind="metadata" field="sync.statusBrief" />
        </Row>
      </Button>
      <Toast when="app.noticeVisible" kind="info">
        <Row align="start" gap={14}>
          <Text field="app.noticeMessage" flex={1} />
          <Button action="dismiss-notice">Dismiss</Button>
        </Row>
      </Toast>
      <Toast when="app.errorNoticeVisible" kind="error">
        <Row align="start" gap={14}>
          <Text field="app.noticeMessage" flex={1} />
          <Button action="dismiss-notice">Dismiss</Button>
        </Row>
      </Toast>
    </Panel>
  </Header>

  <Section id="main-content" width="fill" maxWidth={1480} alignSelf="center" paddingTop={30} paddingX={32} paddingBottom={72}>
    <ErrorState when="app.connectionFailed" label="Couldn’t connect">
      <Title level="page">Couldn’t connect</Title>
      <Text>Check that the local Health server is running.</Text>
      <Code field="app.connectionError" />
      <Button action="retry-connection" emphasis="primary">Try again</Button>
    </ErrorState>
    <LoadingState when="app.starting" label="Loading Health" />

    <Section when="app.ready" gap={24}>
      <Header>
        <Row width="fill" justify="between" align="end" wrap rowGap={16} columnGap={24}>
          <Stack gap={4}>
            <Title level="page" field="app.selectedDayLabel" />
            <Date field="app.selectedDay" />
          </Stack>
          <Row gap={10} wrap>
            <Row gap={0}>
              <IconButton icon="previous" label="Previous day" action="select-previous-day" />
              <Button action="open-calendar" label="Choose date" controls="date-dialog">
                <Date field="app.selectedDay" />
              </Button>
              <IconButton icon="next" label="Next day" action="select-next-day" />
            </Row>
            <Section when="app.otherDaySelected">
              <Link destination="dashboard-today">Today</Link>
            </Section>
            <Row gap={8}>
              <Button action="open-weight-entry" controls="weight-dialog" emphasis="secondary">Log weight</Button>
              <Button action="open-food-entry" controls="food-dialog" emphasis="primary">
                <Row gap={8}><Text>Log food</Text><Text kind="metadata">F</Text></Row>
              </Button>
            </Row>
          </Row>
        </Row>
      </Header>
      <Alert when="app.otherDaySelected" kind="warning">
        <Text field="app.loggingDateContext" />
      </Alert>

      <Row width="fill" align="start" gap={20}>
        <Section id="selected-day" label="Selected day" flex={5} minWidth={360}>
          <ErrorState when="day.failed" label="This day couldn’t be loaded.">
            <Title level="section">This day couldn’t be loaded.</Title>
            <Code field="day.error" />
            <Button action="retry-day" emphasis="secondary">Try again</Button>
          </ErrorState>
          <LoadingState when="day.initialLoading" label="Loading day" />
          <Section when="day.loaded" busy="day.refreshing" gap={12}>
            <Alert when="day.unreadableRecords" kind="warning">
              <Text>Some records could not be read.</Text>
              <Code field="day.unreadableRecordDetails" />
            </Alert>

            <Panel id="nutrition" label="Nutrition for selected day">
              <Header paddingX={18} paddingTop={15}>
                <Row justify="between" gap={12}>
                  <Title level="section">Nutrition</Title>
                  <Text kind="metadata" field="day.foodEntryCountText" />
                </Row>
              </Header>
              <Row gap={24} paddingX={18} paddingTop={14} paddingBottom={6}>
                <Chart source="day.nutritionProgress" kind="concentric-progress" label="Energy and protein progress" size={132} />
                <Stack flex={1} gap={14}>
                  <Section label="Energy">
                    <Text>Energy</Text>
                    <Row align="baseline" gap={5}>
                      <Metric field="day.energyConsumed" />
                      <Text field="day.energyReferenceText" />
                    </Row>
                    <Text kind="metadata" field="day.energyProgressText" />
                  </Section>
                  <Section label="Protein">
                    <Text>Protein</Text>
                    <Row align="baseline" gap={5}>
                      <Metric field="day.proteinConsumed" />
                      <Text field="day.proteinReferenceText" />
                    </Row>
                    <Text kind="metadata" field="day.proteinProgressText" />
                  </Section>
                </Stack>
              </Row>
              <Section paddingX={18} paddingTop={10} paddingBottom={18} gap={10}>
                <Chart source="day.macroEnergyShares" kind="stacked-bar" label="Share of energy from protein, carbs and fat" height={6} />
                <HorizontalList source="day.visibleMacros">
                  <ListItem entity="macro">
                    <Row gap={6}>
                      <Text kind="metadata" field="label" />
                      <Text field="amountText" />
                    </Row>
                  </ListItem>
                </HorizontalList>
              </Section>
              <Alert when="day.hasPendingRecords" kind="warning">
                <Button action="open-sync" controls="sync-dialog">
                  <Row width="fill" justify="between">
                    <Text field="day.pendingRecordCountText" />
                    <Text>Review</Text>
                  </Row>
                </Button>
              </Alert>
            </Panel>

            <Grid id="day-readings" columns={2} gap={12}>
              <Panel id="weight" label="Weight for selected day">
                <Header paddingX={18} paddingTop={15}>
                  <Row justify="between" gap={12}>
                    <Title level="section">Weight</Title>
                    <Button action="open-weight-entry" controls="weight-dialog">Log weight</Button>
                  </Row>
                </Header>
                <EmptyState when="day.noWeights"><Text>No weigh-in</Text></EmptyState>
                <List source="day.weights">
                  <ListItem entity="weight-record" paddingX={18} paddingTop={8} paddingBottom={16}>
                    <Row justify="between" align="start" gap={8}>
                      <Stack gap={2} flex={1}>
                        <Metric field="amountWithUnit" />
                        <Text kind="metadata" field="firstReadingChangeText" />
                        <Row gap={8}>
                          <Date field="time" />
                          <Badge field="visibleSyncState" />
                        </Row>
                        <Text field="remoteNote" />
                      </Stack>
                      <Row gap={2}>
                        <IconButton icon="edit" label="Edit weight" action="edit-weight" controls="edit-weight-dialog" />
                        <IconButton icon="delete" label="Delete weight" action="delete-weight" controls="delete-dialog" emphasis="danger" />
                      </Row>
                    </Row>
                  </ListItem>
                </List>
              </Panel>
              <Panel id="burned" label="Calories burned for selected day">
                <Header paddingX={18} paddingTop={15}>
                  <Row justify="between" gap={12}>
                    <Title level="section">Burned</Title>
                    <Text kind="metadata">Google Health</Text>
                  </Row>
                </Header>
                <EmptyState when="day.burnedMissing"><Text>Not pulled yet</Text></EmptyState>
                <Section when="day.burnedAvailable" paddingX={18} paddingTop={8} paddingBottom={16}>
                  <Metric field="day.burnedWithUnit" />
                  <Text field="day.budgetLeftText" />
                  <Text kind="metadata" field="day.deficitNote" />
                  <Text kind="metadata" field="day.burnedUpdatedText" />
                </Section>
              </Panel>
            </Grid>

            <Panel id="food-log" label="Meals for selected day" paddingBottom={8}>
              <Header paddingX={18} paddingTop={15}>
                <Row justify="between" gap={12}>
                  <Title level="section">Food log</Title>
                  <Text kind="metadata">Per portion</Text>
                </Row>
              </Header>
              <EmptyState when="day.noFood" paddingX={24} paddingTop={44} paddingBottom={40}>
                <Title level="item">No food logged for this day.</Title>
                <Text>Add a meal or reuse one you’ve logged before.</Text>
                <Button action="open-food-entry" controls="food-dialog" emphasis="primary">Log food</Button>
              </EmptyState>
              <GroupedList source="day.food" groupBy="meal">
                <Group entity="meal-group">
                  <Header paddingX={18} paddingTop={16} paddingBottom={4}>
                    <Row justify="between" align="baseline">
                      <Title level="item" field="label" />
                      <Text kind="metadata" field="totalCaloriesText" />
                    </Row>
                  </Header>
                  <List source="entries">
                    <ListItem entity="food-record" paddingX={18} paddingY={12}>
                      <Row align="baseline" gap={10}>
                        <Date field="time" width={42} />
                        <Stack flex={1} gap={2}>
                          <Row gap={6}>
                            <Icon icon="catalog-food" label="Google catalog food" />
                            <Title level="item" field="name" />
                          </Row>
                          <Row wrap rowGap={2} columnGap={10}>
                            <Text kind="metadata" field="portionText" />
                            <Text kind="metadata" field="proteinText" />
                            <Text kind="metadata" field="carbsText" />
                            <Text kind="metadata" field="fatText" />
                            <Badge field="visibleSyncState" />
                          </Row>
                        </Stack>
                        <Row gap={2}>
                          <IconButton icon="edit" label="Edit food" action="edit-food" controls="edit-food-dialog" />
                          <IconButton icon="reuse" label="Reuse food" action="reuse-food" controls="food-dialog" />
                          <IconButton icon="delete" label="Delete food" action="delete-food" controls="delete-dialog" emphasis="danger" />
                        </Row>
                        <Stack width={44}>
                          <Metric field="calories" />
                          <Text kind="metadata">kcal</Text>
                        </Stack>
                      </Row>
                    </ListItem>
                  </List>
                </Group>
              </GroupedList>
            </Panel>
          </Section>
        </Section>

        <Section id="trends" label="Trends" flex={7} gap={12} busy="trends.refreshing">
          <ErrorState when="trends.failed" label="Couldn’t load trends.">
            <Title level="section">Couldn’t load trends.</Title>
            <Code field="trends.error" />
            <Button action="retry-trends" emphasis="secondary">Retry trends</Button>
          </ErrorState>
          <Section when="trends.available">
            <Row gap={12} minHeight={36} wrap>
              <Section when="trends.initialLoading"><Title level="section">Trends</Title></Section>
              <Text kind="metadata" field="trends.rangeDateText" />
              <FieldGroup label="Trend range">
                <Row>
                <Button action="set-range-30" selected="trends.range30">30d</Button>
                <Button action="set-range-90" selected="trends.range90">90d</Button>
                <Button action="set-range-180" selected="trends.range180">180d</Button>
                <Button action="set-range-365" selected="trends.range365">1y</Button>
                </Row>
              </FieldGroup>
            </Row>
            <LoadingState when="trends.initialLoading" label="Loading trends" />
            <Section when="trends.loaded" gap={12}>
              <Grid id="trend-summaries" columns={4} gap={12}>
                <Panel label="Budget today" columnSpan={4} padding={16}>
                  <Row gap={16}>
                    <Text>Budget today</Text>
                    <Metric field="trends.todayBudgetText" />
                    <Text kind="metadata" field="trends.todayBudgetHint" flex={1} />
                  </Row>
                </Panel>
                <Panel label="Weight trend" padding={16}>
                  <Text>Weight trend</Text>
                  <Metric field="trends.weightTrendText" />
                  <Text kind="metadata" field="trends.weightTrendHint" />
                </Panel>
                <Panel label="Weekly change" padding={16}>
                  <Text>Weekly change</Text>
                  <Metric field="trends.weeklyChangeText" />
                  <Text kind="metadata" field="trends.weeklyChangeHint" />
                </Panel>
                <Panel label="Daily intake" padding={16}>
                  <Text>Daily intake</Text>
                  <Metric field="trends.dailyIntakeText" />
                  <Text kind="metadata" field="trends.intakeCoverageText" />
                </Panel>
                <Panel label="Daily protein" padding={16}>
                  <Text>Daily protein</Text>
                  <Metric field="trends.dailyProteinText" />
                  <Text kind="metadata" field="trends.proteinCoverageText" />
                </Panel>
              </Grid>

              <Panel id="trend-charts" label="Weight and nutrition charts">
                <Header paddingX={18} paddingTop={16}>
                  <Row justify="between" gap={12}>
                    <Title level="section">Weight &amp; nutrition</Title>
                    <Text kind="metadata">7-day average</Text>
                  </Row>
                </Header>
                <Section id="chart-day-readout" paddingX={18} paddingY={12}>
                  <Row wrap gap={16}>
                    <Date field="trends.readoutDay" />
                    <Text kind="metadata" field="trends.selectDayHint" />
                    <Text field="trends.readoutWeightText" />
                    <Text field="trends.readoutAverageText" />
                    <Text field="trends.readoutCaloriesText" />
                  </Row>
                  <EmptyState when="trends.selectionOutsideRange">
                    <Text>Selected day is outside this range</Text>
                  </EmptyState>
                </Section>
                <Stack gap={12}>
                  <Section label="Weight chart">
                    <Header paddingX={18}>
                      <Row wrap gap={10}>
                        <Title level="item">Weight</Title>
                        <Text kind="metadata" field="trends.weightCoverageText" />
                      </Row>
                    </Header>
                 <Section when="trends.weightChartAvailable">
                      <Chart source="trends.weight" kind="points-and-line" label="Weight over the selected range" height={230} selection="single" action="select-chart-day" />
                      <Text kind="description">Dots are readings; the line is a centred seven-day average. It breaks where more than a week passed without one.</Text>
                    </Section>
                    <EmptyState when="trends.noWeight"><Text>No weight readings in this range.</Text></EmptyState>
                    <EmptyState when="trends.tooFewWeightReadings"><Text field="trends.weightThresholdText" /></EmptyState>
                  </Section>
                  <Section label="Calories chart">
                    <Header paddingX={18}>
                      <Title level="item">Calories</Title>
                      <Text kind="metadata" field="trends.intakeCoverageText" />
                      <HorizontalList source="trends.calorieLegend">
                        <ListItem entity="legend-entry"><Text field="label" /></ListItem>
                      </HorizontalList>
                    </Header>
                    <Section when="trends.caloriesChartAvailable">
                      <Chart source="trends.calories" kind="stacked-columns-and-line" label="Calories over the selected range" height={200} selection="single" action="select-chart-day" />
                      <Text kind="description" field="trends.calorieChartNote" />
                    </Section>
                    <EmptyState when="trends.noCalories"><Text>No food logged or calories burned in this range.</Text></EmptyState>
                  </Section>
                  <Section label="Protein chart">
                    <Header paddingX={18}>
                      <Row gap={10}>
                        <Title level="item">Protein</Title>
                        <Text kind="metadata">grams</Text>
                      </Row>
                    </Header>
                    <Section when="trends.proteinChartAvailable">
                      <Chart source="trends.protein" kind="columns" label="Protein over the selected range" height={128} selection="single" action="select-chart-day" />
                    </Section>
                    <EmptyState when="trends.noProtein"><Text>Nothing logged in this range.</Text></EmptyState>
                  </Section>
                </Stack>
                <Footer padding={18}>
                  <Text kind="description">Click a chart to open that day. Logged intake and measured weight are two records side by side, not cause and effect: weight moves with hydration, sleep and time of day.</Text>
                </Footer>
              </Panel>
            </Section>
          </Section>
        </Section>
      </Row>
    </Section>
  </Section>

  <Dialog id="date-dialog" label="Choose a date" when="calendar.open" width="fill" maxWidth={540} scroll="vertical">
    <Header position="sticky" top={0}>
      <Row justify="between">
        <Title level="section">Choose a date</Title>
        <IconButton icon="close" label="Close Choose a date" action="close-calendar" />
      </Row>
    </Header>
    <Section padding={24}>
      <Form action="jump-to-date">
        <Row gap={10} align="end">
          <FormField label="Go to date" flex={1} required>
            <DatePicker field="calendar.jumpDate" required />
          </FormField>
          <Button action="jump-to-date" emphasis="secondary">Go</Button>
        </Row>
      </Form>
      <Header>
        <Row gap={4}>
          <Title level="item" field="calendar.monthLabel" flex={1} />
          <IconButton icon="previous" label="Previous month" action="previous-month" />
          <IconButton icon="next" label="Next month" action="next-month" />
        </Row>
      </Header>
      <Section when="calendar.loaded">
        <Calendar source="calendar.month" selection="single" action="choose-calendar-day" />
      </Section>
      <LoadingState when="calendar.loading" label="Loading month…" minHeight={312} />
      <ErrorState when="calendar.failed">
        <Text>Couldn’t load this month.</Text>
        <Button action="retry-month" emphasis="secondary">Retry month</Button>
      </ErrorState>
      <Footer>
        <Row justify="between" gap={12}>
          <Text kind="metadata">Calories logged on each day</Text>
          <Button action="choose-calendar-today" emphasis="secondary">Today</Button>
        </Row>
      </Footer>
    </Section>
  </Dialog>

  <Dialog id="food-dialog" label="Log food or Reuse food" when="foodDraft.open" width="fill" maxWidth={540} scroll="vertical">
    <Header position="sticky" top={0}>
      <Row justify="between">
        <Title level="section" field="foodDraft.dialogTitle" />
        <IconButton icon="close" label="Close food entry" action="close-food-entry" />
      </Row>
    </Header>
    <Form action="log-food" busy="foodDraft.saving">
      <Grid columns={2} gap={12} padding={24}>
        <FormField label="Date" required><DatePicker field="foodDraft.date" required disabled="foodDraft.saving" /></FormField>
        <FormField label="Time (Pacific)"><TextInput field="foodDraft.time" disabled="foodDraft.saving" /></FormField>
      </Grid>
      <Section when="foodDraft.searching">
        <FormField label="What did you eat?" paddingX={24}>
          <SearchInput field="foodDraft.query" placeholder="Search or type a new food" action="search-past-foods" controls="past-food-results" />
        </FormField>
        <Alert when="foodDraft.searchFailed" kind="warning"><Text>Past foods couldn’t be loaded. You can still enter a new food.</Text></Alert>
        <Section id="past-food-results" maxHeight={310} scroll="vertical" paddingX={12} paddingBottom={16}>
          <Section when="foodDraft.showRecentHeading"><Text kind="metadata">Recent</Text></Section>
          <List source="foodDraft.matches" selection="single">
            <ListItem entity="past-food" action="choose-past-food" selected="active">
              <Row gap={12} align="baseline">
                <Text field="name" flex={1} />
                <Text field="calories" minWidth={40} />
                <Date field="day" width={36} />
              </Row>
            </ListItem>
          </List>
          <Button action="start-new-food"><Text field="foodDraft.newFoodLabel" /></Button>
        </Section>
      </Section>
      <Section when="foodDraft.editing" padding={24} gap={12}>
        <Button action="return-to-food-search">Back to food search</Button>
        <FieldGroup label="Meal">
          <Row>
            <Button action="set-food-breakfast" selected="foodDraft.breakfast">Breakfast</Button>
            <Button action="set-food-lunch" selected="foodDraft.lunch">Lunch</Button>
            <Button action="set-food-dinner" selected="foodDraft.dinner">Dinner</Button>
            <Button action="set-food-snack" selected="foodDraft.snack">Snack</Button>
            <Button action="set-food-anytime" selected="foodDraft.anytime">Anytime</Button>
          </Row>
        </FieldGroup>
        <FormField label="Name"><TextInput field="foodDraft.name" /></FormField>
        <Grid columns={3} gap={12}>
          <FormField label="Calories"><TextInput field="foodDraft.calories" /></FormField>
          <FormField label="Amount"><TextInput field="foodDraft.amount" /></FormField>
          <FormField label="Unit"><TextInput field="foodDraft.unit" /></FormField>
        </Grid>
        <Grid columns={3} gap={12}>
          <FormField label="Protein"><TextInput field="foodDraft.protein" /></FormField>
          <FormField label="Carbs"><TextInput field="foodDraft.carbs" /></FormField>
          <FormField label="Fat"><TextInput field="foodDraft.fat" /></FormField>
        </Grid>
        <Accordion id="food-extra-fields">
          <Section expanded="foodDraft.extrasExpanded">
            <Title level="item">Sugar, fibre, sodium, note</Title>
            <Grid columns={3} gap={12}>
              <FormField label="Sugar"><TextInput field="foodDraft.sugar" /></FormField>
              <FormField label="Fibre"><TextInput field="foodDraft.fibre" /></FormField>
              <FormField label="Sodium mg"><TextInput field="foodDraft.sodiumMg" /></FormField>
            </Grid>
            <FormField label="Private note">
              <TextInput field="foodDraft.privateNote" />
              <Text kind="description">stays on this Mac</Text>
            </FormField>
          </Section>
        </Accordion>
        <Alert kind="info"><Text field="foodDraft.portionConsequence" /></Alert>
        <ErrorState when="foodDraft.failed"><Text field="foodDraft.error" /></ErrorState>
        <Row gap={8}>
          <Button action="log-food" emphasis="primary" flex={1} busy="foodDraft.saving" disabled="foodDraft.saving"><Text field="foodDraft.submitLabel" /></Button>
          <Button action="close-food-entry" emphasis="secondary">Cancel</Button>
        </Row>
      </Section>
    </Form>
  </Dialog>

  <Dialog id="weight-dialog" label="Log weight" when="weightDraft.open" width="fill" maxWidth={540} scroll="vertical">
    <Header position="sticky" top={0}>
      <Row justify="between">
        <Title level="section">Log weight</Title>
        <IconButton icon="close" label="Close Log weight" action="close-weight-entry" />
      </Row>
    </Header>
    <Text kind="metadata" field="weightDraft.loggingDateText" paddingX={24} paddingY={12} />
    <Form action="log-weight" padding={24} busy="weightDraft.saving">
      <Grid columns={2} gap={12}>
        <FormField label="Weight"><TextInput field="weightDraft.value" /></FormField>
        <FieldGroup label="Unit">
          <Row>
            <Button action="set-weight-kg" selected="weightDraft.kg">kg</Button>
            <Button action="set-weight-lb" selected="weightDraft.lb">lb</Button>
          </Row>
        </FieldGroup>
      </Grid>
      <FormField label="Time">
        <TextInput field="weightDraft.time" />
        <Text kind="description" field="weightDraft.timeHint" />
      </FormField>
      <FormField label="Note sent to Google"><TextInput field="weightDraft.remoteNote" /></FormField>
      <ErrorState when="weightDraft.failed"><Text field="weightDraft.error" /></ErrorState>
      <Row gap={8}>
        <Button action="log-weight" emphasis="primary" flex={1} busy="weightDraft.saving" disabled="weightDraft.saving"><Text field="weightDraft.submitLabel" /></Button>
        <Button action="close-weight-entry" emphasis="secondary">Cancel</Button>
      </Row>
    </Form>
  </Dialog>

  <Dialog id="edit-food-dialog" label="Edit food" when="edit.foodOpen" width="fill" maxWidth={540} scroll="vertical">
    <Header position="sticky" top={0}>
      <Row justify="between">
        <Title level="section">Edit food</Title>
        <IconButton icon="close" label="Close Edit food" action="close-edit" />
      </Row>
    </Header>
    <Date field="record.day" paddingX={24} paddingY={12} />
    <Form action="save-food-edit" padding={24} busy="edit.saving">
      <FieldGroup label="Meal">
        <Row>
          <Button action="edit-meal-breakfast" selected="edit.breakfast">Breakfast</Button>
          <Button action="edit-meal-lunch" selected="edit.lunch">Lunch</Button>
          <Button action="edit-meal-dinner" selected="edit.dinner">Dinner</Button>
          <Button action="edit-meal-snack" selected="edit.snack">Snack</Button>
          <Button action="edit-meal-anytime" selected="edit.anytime">Anytime</Button>
        </Row>
      </FieldGroup>
      <FormField label="Name">
        <TextInput field="edit.name" disabled="record.catalogFood" />
        <Text kind="description" field="edit.nameHint" />
      </FormField>
      <Grid columns={3} gap={12}>
        <FormField label="Calories"><TextInput field="edit.calories" /></FormField>
        <FormField label="Amount"><TextInput field="edit.amount" /></FormField>
        <FormField label="Unit"><TextInput field="edit.unit" /></FormField>
      </Grid>
      <Grid columns={3} gap={12}>
        <FormField label="Protein"><TextInput field="edit.protein" /></FormField>
        <FormField label="Carbs"><TextInput field="edit.carbs" /></FormField>
        <FormField label="Fat"><TextInput field="edit.fat" /></FormField>
      </Grid>
      <Grid columns={3} gap={12}>
        <FormField label="Sugar"><TextInput field="edit.sugar" /></FormField>
        <FormField label="Fibre"><TextInput field="edit.fibre" /></FormField>
        <FormField label="Sodium mg"><TextInput field="edit.sodiumMg" /></FormField>
      </Grid>
      <Alert when="edit.amountChanged" kind="info"><Text field="edit.scalingNotice" /></Alert>
      <FormField label="Time"><TextInput field="edit.time" /></FormField>
      <Alert when="edit.showConsequence" kind="warning"><Text field="edit.saveConsequence" /></Alert>
      <ErrorState when="edit.failed"><Text field="edit.error" /></ErrorState>
      <Row gap={8}>
        <Button action="save-food-edit" emphasis="primary" flex={1} disabled="edit.saveDisabled" busy="edit.saving">Save changes</Button>
        <Button action="close-edit" emphasis="secondary">Cancel</Button>
      </Row>
    </Form>
  </Dialog>

  <Dialog id="edit-weight-dialog" label="Edit weight" when="edit.weightOpen" width="fill" maxWidth={540} scroll="vertical">
    <Header position="sticky" top={0}>
      <Row justify="between">
        <Title level="section">Edit weight</Title>
        <IconButton icon="close" label="Close Edit weight" action="close-edit" />
      </Row>
    </Header>
    <Date field="record.day" paddingX={24} paddingY={12} />
    <Form action="save-weight-edit" padding={24} busy="edit.saving">
      <Grid columns={2} gap={12}>
        <FormField label="Weight"><TextInput field="edit.weight" /></FormField>
        <FieldGroup label="Unit">
          <Row>
            <Button action="edit-weight-kg" selected="edit.kg">kg</Button>
            <Button action="edit-weight-lb" selected="edit.lb">lb</Button>
          </Row>
        </FieldGroup>
      </Grid>
      <FormField label="Time"><TextInput field="edit.time" /></FormField>
      <FormField label="Note sent to Google"><TextInput field="edit.remoteNote" /></FormField>
      <Alert when="edit.showConsequence" kind="info"><Text field="edit.saveConsequence" /></Alert>
      <ErrorState when="edit.failed"><Text field="edit.error" /></ErrorState>
      <Row gap={8}>
        <Button action="save-weight-edit" emphasis="primary" flex={1} disabled="edit.saveDisabled" busy="edit.saving">Save changes</Button>
        <Button action="close-edit" emphasis="secondary">Cancel</Button>
      </Row>
    </Form>
  </Dialog>

  <Dialog id="delete-dialog" label="Delete food or weight" when="deletion.open" width="fill" maxWidth={540} scroll="vertical">
    <Header position="sticky" top={0}>
      <Row justify="between">
        <Title level="section" field="deletion.dialogTitle" />
        <IconButton icon="close" label="Close deletion" action="close-delete" />
      </Row>
    </Header>
    <Date field="record.day" paddingX={24} paddingY={12} />
    <Section padding={24}>
      <Confirmation when="deletion.confirming" label="Delete record">
        <Text field="deletion.consequence" />
        <Row justify="end" gap={10}>
          <Button action="confirm-delete" emphasis="danger" disabled="deletion.running">Delete</Button>
          <Button action="close-delete" emphasis="secondary">Cancel</Button>
        </Row>
      </Confirmation>
      <ErrorState when="deletion.failed">
        <Text field="deletion.error" />
        <Button action="close-delete" emphasis="secondary">Cancel</Button>
      </ErrorState>
    </Section>
  </Dialog>

  <Dialog id="sync-dialog" label="Google Health" when="sync.dialogOpen" position="fixed" placement="top" top={10} width="fill" maxWidth={560} scroll="vertical">
    <Header position="sticky" top={0}>
      <Row justify="between">
        <Title level="section">Google Health</Title>
        <IconButton icon="close" label="Close Google Health" action="close-sync" />
      </Row>
    </Header>
    <Header padding={24}>
      <Row align="start" gap={16}>
        <Stack flex={1}>
          <Title level="item" field="sync.statusHeading" />
          <Text kind="description" field="sync.statusDetail" />
        </Stack>
        <Button action="sync-now" disabled="sync.running" busy="sync.running"><Text field="sync.syncButtonLabel" /></Button>
      </Row>
    </Header>
    <Section when="sync.needsAttention" label="Needs attention" padding={24}>
      <Row gap={8}><Title level="item">Needs attention</Title><Text kind="metadata" field="sync.attentionCount" /></Row>
      <List source="sync.attention">
        <ListItem entity="attention-item">
          <Row align="start" gap={10}>
            <Badge field="label" width={92} />
            <Stack flex={1}>
              <Text field="text" />
              <List source="diffs"><ListItem entity="field-difference"><Text field="comparisonText" /></ListItem></List>
              <Text kind="description" field="advice" />
            </Stack>
          </Row>
        </ListItem>
      </List>
      <Section when="sync.pullAvailable"><Button action="pull-now" disabled="sync.running">Pull now</Button></Section>
    </Section>
    <Section label="To Google Health" padding={24}>
      <Row gap={8}><Title level="item">To Google Health</Title><Text kind="metadata" field="sync.waitingCountText" /></Row>
      <EmptyState when="sync.nothingWaiting"><Text>Nothing waiting. New entries are sent as you log them. Edits and deletions collect here until you push.</Text></EmptyState>
      <Section when="sync.hasWaitingRecords">
        <GroupedList source="sync.outgoing" groupBy="collection">
          <Group entity="outgoing-collection">
            <Title level="item" field="label" />
            <List source="entries">
              <ListItem entity="outgoing-record"><Row gap={10}><Badge field="tag" width={92} /><Text field="text" flex={1} /></Row></ListItem>
            </List>
            <Text kind="metadata" field="moreCountText" />
          </Group>
        </GroupedList>
        <Section when="sync.hasDeletions">
          <Checkbox name="also-delete" checked="sync.alsoDelete" label="Also delete pending records from Google Health" />
          <Text field="sync.deleteCountText" />
          <Text kind="description" field="sync.heldDeletionHint" />
        </Section>
        <Row wrap gap={12}>
          <Button action="push-changes" emphasis="primary" disabled="sync.pushDisabled"><Text field="sync.pushButtonLabel" /></Button>
          <Text kind="description" field="sync.pushHint" />
        </Row>
      </Section>
    </Section>
    <Section when="sync.hasIncomingResults" label="From Google Health" padding={24}>
      <Row gap={8}><Title level="item">From Google Health</Title><Text kind="metadata" field="sync.incomingCountText" /></Row>
      <List source="sync.visibleIncoming">
        <ListItem entity="incoming-record">
          <Row align="start" gap={10}>
            <Badge field="tagLabel" width={92} />
            <Stack flex={1}>
              <Text field="detailText" />
              <List source="diffs"><ListItem entity="field-difference"><Text field="comparisonText" /></ListItem></List>
            </Stack>
          </Row>
        </ListItem>
      </List>
      <Section when="sync.moreIncomingAvailable"><Button action="show-all-incoming"><Text field="sync.showAllLabel" /></Button></Section>
      <Text kind="description" field="sync.keptLocalVersionsText" />
    </Section>
    <Accordion id="sync-command-output" when="sync.hasLastRun" padding={24}>
      <Section expanded="sync.outputExpanded">
        <Title level="item">Command output</Title>
        <Code field="sync.command" />
        <Code field="sync.stdout" />
        <Code field="sync.stderr" />
      </Section>
    </Accordion>
  </Dialog>

  <Dialog id="settings-dialog" label="Settings" when="settings.open" width="fill" maxWidth={540} scroll="vertical">
    <Header position="sticky" top={0}>
      <Row justify="between">
        <Title level="section">Settings</Title>
        <IconButton icon="close" label="Close Settings" action="close-settings" />
      </Row>
    </Header>
    <Section padding={24} gap={16}>
      <Title level="item">Targets</Title>
      <Form action="save-targets">
        <FormField label="Daily calorie target">
          <TextInput field="settings.dailyCalories" />
          <Text kind="description">The dotted goal line on the calorie chart. Leave blank for none.</Text>
        </FormField>
        <FormField label="Daily protein target (g)"><TextInput field="settings.dailyProtein" /></FormField>
        <FormField label="Daily deficit goal (kcal)">
          <TextInput field="settings.dailyDeficit" />
          <Text kind="description">How far under calories burned to stay. Today’s budget is burned minus eaten minus this. 0 aims to match what you burn.</Text>
        </FormField>
        <FieldGroup label="Show weight in">
          <Row>
            <Button action="display-weight-follow-cli" selected="settings.followCli" flex={2.5}><Text field="settings.followCliLabel" /></Button>
            <Button action="display-weight-kg" selected="settings.kg" flex={1}>kg</Button>
            <Button action="display-weight-lb" selected="settings.lb" flex={1}>lb</Button>
          </Row>
          <Text kind="description">Display only. Files keep kilograms and Google Health stores grams; nothing is converted on disk.</Text>
        </FieldGroup>
        <ErrorState when="settings.failed"><Text field="settings.error" /></ErrorState>
        <Button action="save-targets" emphasis="primary" width="fill">Save targets</Button>
      </Form>
      <Section label="Paths">
        <Title level="item">Paths</Title>
        <List source="settings.paths">
          <ListItem entity="setting-path"><Row align="baseline" gap={12}><Text field="label" width={64} /><Text field="value" flex={1} /></Row></ListItem>
        </List>
      </Section>
    </Section>
  </Dialog>

  <Dialog id="activity-dialog" label="Activity" when="activity.open" width="fill" maxWidth={540} scroll="vertical">
    <Header position="sticky" top={0}>
      <Row justify="between">
        <Title level="section">Activity</Title>
        <IconButton icon="close" label="Close Activity" action="close-activity" />
      </Row>
    </Header>
    <Section paddingX={24} paddingBottom={22}>
      <LoadingState when="app.operationRunning" label="An operation is running…" />
      <EmptyState when="activity.empty"><Text>No activity in this session yet.</Text></EmptyState>
      <List source="activity.entries">
        <ListItem entity="operation" paddingY={16}>
          <Row align="start" gap={10}>
            <Code field="command" flex={1} />
            <Badge field="resultLabel" />
            <Date field="time" />
          </Row>
          <Code field="error" />
          <Code field="stdout" />
          <Code field="stderr" />
        </ListItem>
      </List>
    </Section>
  </Dialog>

  <Dialog id="shortcuts-dialog" label="Keyboard shortcuts" when="shortcuts.open" width="fill" maxWidth={540} scroll="vertical">
    <Header position="sticky" top={0}>
      <Row justify="between">
        <Title level="section">Keyboard shortcuts</Title>
        <IconButton icon="close" label="Close Keyboard shortcuts" action="close-shortcuts" />
      </Row>
    </Header>
    <Section padding={24}>
      <Section label="Global shortcuts">
        <Title level="item">Global</Title>
        <List source="shortcuts.global">
          <ListItem entity="shortcut"><Row gap={20}><Text field="keys" width={60} /><Text field="description" flex={1} /></Row></ListItem>
        </List>
      </Section>
      <Section label="Selected day shortcuts">
        <Title level="item">Selected day</Title>
        <List source="shortcuts.selectedDay">
          <ListItem entity="shortcut"><Row gap={20}><Text field="keys" width={60} /><Text field="description" flex={1} /></Row></ListItem>
        </List>
      </Section>
    </Section>
  </Dialog>
</Page>
```

## State and interaction details

Selecting a day through the arrows, Today, the calendar, or a chart updates the
day summary and the pinned day in all three charts. Trend range choices are
30, 90, 180, and 365 days; the default is 90. Changing the range preserves the
selected day. Hovering a chart updates the shared readout and crosshair without
selecting a day; clicking selects it. The three chart plots share date alignment,
and the date axis appears beneath Protein. No extra hover control is implied.

Energy progress compares logged intake against calories burned for that day,
including the burn accumulated so far today. Protein progress uses the configured
protein target. Missing burn shows “Burned not pulled yet”; an unset protein
target omits its percentage. Protein, carbs, and fat always appear in the macro
row; Fibre and Sugar appear only when greater than zero. Pending food or weight
records add the Review notice. Weight change appears only on the first reading
and only when a previous weigh-in exists. Burned includes the budget, optional
deficit note, and fetch time. Missing burn remains a missing-data state.

Food groups appear in Breakfast, Lunch, Dinner, Snack, Anytime order, followed
by any other nonempty meal groups. Empty groups are omitted. Each row shows
time, name, portion, P/C/F totals, calories, and Edit/Reuse/Delete. The catalog
icon is present only for identified Google catalog foods. Sync badges appear
only on records that are not synced; notes and comparison text are omitted
when absent. The AST's `visibleSyncState` and optional display fields represent
these visible variants, not additional always-present labels. Desktop food-row
actions are revealed on hover or keyboard focus; on mobile they remain visible.
Refreshing a loaded day keeps its content visible and temporarily inert.

The trend summaries cover the chosen range independently of the selected day;
Budget today always refers to today. Weight trend is a seven-day average, Weekly
change is a fitted rate, and intake/protein means describe logged days. Their
hint fields retain coverage and provisional/insufficient-data copy. With fewer
than seven weight readings, the weight plot is replaced by a count and “The
trend line appears at seven.” It shows no plot in that state. The calorie chart
compares stacked macro intake with burned calories and an optional calorie goal;
its legend is Protein, Carbs, Fat, Other, Burned, Over burned, and optional Goal.
Protein has an optional target reference. Chart notes distinguish unlogged days
from no eating and remind the reader that today’s burn is accumulating.

`open-food-entry` starts the food search with today's date and the current
Pacific time, even when another dashboard day is selected. `reuse-food` opens
the same dialog directly on a draft populated from that row, also defaulting to
today. Food search offers recent or matching local foods and a New food action;
Up/Down and Enter select a result. Search failure still allows new-food entry.
Choosing a result or New food exposes the draft; Back returns to search.
The extra-nutrients disclosure starts closed. Amount changes scale a reused
food's displayed nutrition; manually entered nutrition is already the total
for the portion. Saving creates and syncs the entry, closes the dialog, selects
the logged date, and displays a notice. The submit label becomes “Logging…”
while saving. Only the date/time controls and submit button are disabled by
that saving state in the current implementation.

`open-weight-entry` uses the selected dashboard day. Weight is a positive numeric
input with kg/lb choice; blank time means current time today or a noon placeholder
on a past day. Its note is sent to Google. Successful logging closes the dialog
and refreshes the day. Food nutrition and amount fields are numeric inputs;
Time fields are native time inputs, and Date fields are native date inputs.
Private note and Note sent to Google are single-line text inputs. Other than
the required date in food entry, the AST does not add input requirements that
are absent from the rendered forms.

`edit-food` and `edit-weight` open local editing forms with the record's date.
Catalog food names cannot be edited. Amount changes rescale nutrition and expose
a scaling notice. Save changes is disabled until a field changes, or while
saving. The consequence notice appears after changes: edits save locally;
a synced food is replaced in Google Health on the next push, while weight
remains edited until push. Edit errors replace the consequence notice.
`delete-food` and `delete-weight` open a confirmation with the record's date and
name. A synced record is removed locally now and from Google Health on the next
push; an unsent record is removed locally only. A deletion failure replaces
the confirmation copy and hides Delete, leaving Cancel.

`open-sync` opens the top-centered modal. Sync now and Pull now fetch updates;
Push pulls first and then sends pending changes, with a dynamic count label.
The deletion checkbox starts checked when its section appears. Conflicts disable
push until resolved. Needs attention includes status, differences, and advice.
Outgoing records are grouped by Food/Weight; incoming results initially show at
most eight rows, with Show all when more exist. Held local records and held
deletions have explanatory copy. Command output starts collapsed and appears
after a run. The status island grows from 236 reference units at rest to 252
while working and up to 440 while showing a notice; it displays “Running” for
a nonsync operation. Notice and error notice are alternate states, each with
Dismiss. Its icon conveys sync or warning state. These variants share one
status surface rather than add separate dashboard panels.

Settings is a modal even though its implementation component is named
SettingsPopover. Save targets persists the settings, closes the dialog, and
shows a notice. Calorie and protein targets can be blank; the deficit has a
nonnegative numeric input. Weight display choices are Follow CLI, kg, and lb.
Paths lists Config, Food, Weight, Timezone, and CLI unit only when configuration
information is available. Activity lists this session's commands, result badges,
timestamps, and present output/error text; it also shows running and empty states.
All dialogs close via their close button, Escape, or an outside click, constrain
their height to the viewport, scroll internally, and restore focus to the trigger.

The shortcuts dialog displays P (sync), ? (shortcuts), Esc (close), Left/Right
(previous/next day), Up/Down (previous/next week), T (today), D (calendar), F or /
(food), and W (weight). Its current food shortcut description says “Log food to
the selected day”; the actual food form defaults to today. This existing copy
discrepancy is preserved as a source observation, not silently corrected here.

## Narrow-screen layout

The tree above records the wide-screen composition. Responsive alternatives
are listed here because v0.1 does not define breakpoint props. These thresholds
are observations from the source, not AST attributes.

| Available width | Existing structural change |
| --- | --- |
| Above 1181 | Selected day and trends are side by side in a 5:7 relationship; the day column stacks Nutrition, the Weight/Burned pair, and Food log. |
| Up to 1181 | Trends moves below the day. Nutrition sits beside a vertical Weight/Burned stack in a 1.35:1 relationship; Food log spans below both. |
| Up to 761 | Nutrition, the Weight/Burned pair, Food log, and Trends form a vertical flow. Trend summaries use two columns, with Budget today spanning both. Logging actions fill their row. Food time moves above the name, calories sit alongside the name/body, and actions follow underneath. Weight actions also move below the reading. Nutrition rings use 112 reference units and an 18-unit gap. The workspace uses 16-unit side padding and 24-unit top padding. |
| Up to 521 | The top bar is 100 reference units high; the status island moves to a second row, centered below the brand/utilities. |
| Up to 520 | Food entry's Date and Time fields stack vertically. |
| Up to 421 | Sync heading and its action can wrap onto separate rows. |
| Up to 421 | Activity command text spans the row; its timestamp moves onto the following row. |
| Up to 381 | Weight and Burned stack. Nutrition rings move above their legend, with Energy/Protein side by side. Workspace side padding becomes 12 reference units. |

The source additionally constrains ordinary dialogs to viewport width minus
32 reference units and the sync dialog to viewport width minus 24. Exact viewport
formulas remain outside the AST. Calendar cells use 56 reference units on wide
screens and 46 on narrow screens, with Sunday-first weekday headings, five or
six week rows, and blank cells outside the month. Each day cell shows its date,
logged calories when present, an optional calorie progress mark, and a sync
attention/pending indicator. Weight and protein cell text is hidden in the
current design; weight may still appear in the cell's accessible description.
The opaque `Calendar` node summarizes this pattern without inventing cell
primitives or visual styling props.

## Source references and verification

- [Application shell and utility dialogs](../apps/web/src/app/app.tsx)
- [Dashboard layout and selected-day controls](../apps/web/src/app/routes/dashboard.tsx)
- [Nutrition, readings, food rows, edit/delete triggers](../apps/web/src/features/journal/components/day.tsx)
- [Trends and shared chart readout](../apps/web/src/features/trends/components/trends-section.tsx)
- [Chart implementations](../apps/web/src/features/trends/components/charts/)
- [Calendar dialog](../apps/web/src/features/journal/components/date-picker.tsx)
- [Calendar cell anatomy](../apps/web/src/features/journal/components/calendar.tsx)
- [Food entry](../apps/web/src/features/journal/components/food-composer.tsx)
- [Weight entry](../apps/web/src/features/journal/components/weight-composer.tsx)
- [Record editing](../apps/web/src/features/journal/components/edit-record.tsx)
- [Deletion confirmation](../apps/web/src/features/journal/components/delete-confirm.tsx)
- [Sync dialog](../apps/web/src/features/sync/components/sync-panel.tsx)
- [Status island](../apps/web/src/features/sync/components/island.tsx)
- [Settings](../apps/web/src/features/settings/components/settings-popover.tsx)
- [Activity](../apps/web/src/features/activity/components/activity-panel.tsx)
- [Shortcuts](../apps/web/src/app/components/shortcut-sheet.tsx)

The AST is checked for JSX syntax, one root, restricted literal props, standard
primitive names, canonical geometry, unique IDs, and valid control/anchor
references. Source inspection establishes the recorded layout and behaviors;
browser rendering and pixel-level reconstruction have not been verified.
