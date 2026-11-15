/**
 * Questions a business asks on a service ("Make and model?") and the
 * customer's answers. Mirrors apps/swathbook-web/src/libs/service-questions.ts
 * (the same rules the database enforces in create_booking); keep them in step.
 */

import type { ServiceQuestion } from '@/data/types';

export const MAX_ANSWER_LENGTH = 1000;

export type QuestionToAsk = ServiceQuestion & { serviceName: string };

/** Every question on the chosen services, in booking order. */
export function questionsFor(services: { id: string; name: string; questions?: ServiceQuestion[] }[], chosenIds: string[]): QuestionToAsk[] {
  return chosenIds.flatMap((id) => {
    const service = services.find((candidate) => candidate.id === id);
    return (service?.questions ?? []).map((question) => ({ ...question, serviceName: service!.name }));
  });
}

/** Problems with the answers, keyed by question id. Empty when they're all fine. */
export function answerErrors(questions: ServiceQuestion[], answers: Record<string, string>) {
  const errors: Record<string, string> = {};
  for (const question of questions) {
    const answer = (answers[question.id] ?? '').trim();
    if (!answer) {
      if (question.required) errors[question.id] = question.kind === 'choice' ? 'Pick one.' : 'Please answer this.';
    } else if (question.kind === 'choice' && !question.options.includes(answer)) {
      errors[question.id] = 'Pick one of the options.';
    } else if (answer.length > MAX_ANSWER_LENGTH) {
      errors[question.id] = `Keep it under ${MAX_ANSWER_LENGTH} characters.`;
    }
  }
  return errors;
}

/** The non-blank answers to send with a booking. */
export function answersToSend(questions: ServiceQuestion[], answers: Record<string, string>) {
  return questions
    .map((question) => ({ questionId: question.id, answer: (answers[question.id] ?? '').trim() }))
    .filter((item) => item.answer !== '');
}
