export function themeWeekEntries(themeWeeks, cards) {
  return themeWeeks.map((week, index) => ({
    index,
    week,
    cards: cards
      .filter((card) => card.themeWeekId === week.weekId)
      .sort((a, b) => a.sequence - b.sequence),
  }));
}

export function showWeekOverview(state) {
  state.route = "week";
  state.weekSelection = null;
  state.weekTarget = null;
  state.collectionTarget = null;
  state.restDayTarget = null;
  state.notice = "";
}

export function showThemeWeek(state, themeWeeks, weekId) {
  const week = themeWeeks.find((item) => item.weekId === weekId);
  if (!week) return null;

  state.route = "week";
  state.weekSelection = week.weekId;
  state.weekTarget = null;
  state.notice = "";
  return week;
}

export function showWeekCoffee(state, cards, contentId) {
  const card = cards.find((item) => item.id === contentId);
  if (!card) return null;

  state.route = "week";
  state.weekSelection = card.themeWeekId;
  state.weekTarget = card.id;
  state.notice = "";
  return card;
}

export function showRoute(state, route) {
  state.route = route;
  if (route !== "today") state.collectionTarget = null;
  if (route !== "week") {
    state.weekSelection = null;
    state.weekTarget = null;
  }
  if (route !== "today") state.restDayTarget = null;
  state.notice = "";
}
