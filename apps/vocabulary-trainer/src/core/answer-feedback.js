/**
 * Erstellt die gemeinsame, UI-neutrale Rückmeldung für bewertete Antworten.
 * Bei einer richtigen Antwort bleibt die bereits sichtbare Lösung bewusst
 * unerwähnt; bei einer falschen Antwort wird sie eindeutig genannt.
 *
 * @param {object} options
 * @param {boolean} options.isCorrect
 * @param {Array<string>} [options.acceptedAnswers]
 * @returns {{title: string, solutionText: string|null}}
 */
export function createAnswerFeedback({ isCorrect, acceptedAnswers = [] } = {}) {
  const solutions = [...new Set(
    (Array.isArray(acceptedAnswers) ? acceptedAnswers : [])
      .map((answer) => (typeof answer === "string" ? answer.trim() : ""))
      .filter(Boolean),
  )];

  if (isCorrect) {
    return { title: "Richtig.", solutionText: null };
  }

  if (solutions.length === 0) {
    return { title: "Noch nicht ganz.", solutionText: null };
  }

  return {
    title: "Noch nicht ganz.",
    solutionText: solutions.length === 1
      ? `Richtig ist: „${solutions[0]}“.`
      : `Richtige Lösungen: ${solutions.join(" / ")}.`,
  };
}
