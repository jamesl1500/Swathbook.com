import { describe, expect, it } from 'vitest';

import type { ServiceQuestion } from '@/data/types';

import { answerErrors, answersToSend, questionsFor } from './questions';

const MODEL: ServiceQuestion = { id: 'q-model', prompt: 'Make and model?', kind: 'text', options: [], required: true };
const KIND: ServiceQuestion = { id: 'q-kind', prompt: 'What kind of car?', kind: 'choice', options: ['Sedan', 'SUV', 'Truck'], required: true };
const AVOID: ServiceQuestion = { id: 'q-avoid', prompt: 'Anything to avoid?', kind: 'text', options: [], required: false };

describe('questions', () => {
  it('lists the chosen services’ questions in booking order', () => {
    const services = [
      { id: 's1', name: 'Full detail', questions: [MODEL, KIND] },
      { id: 's2', name: 'Pet hair', questions: [AVOID] },
      { id: 's3', name: 'Wash' },
    ];
    expect(questionsFor(services, ['s2', 's3', 's1']).map((q) => `${q.serviceName}: ${q.prompt}`)).toEqual([
      'Pet hair: Anything to avoid?',
      'Full detail: Make and model?',
      'Full detail: What kind of car?',
    ]);
  });

  it('needs required answers, and choices from the list', () => {
    expect(answerErrors([MODEL, KIND, AVOID], {})).toEqual({ 'q-model': 'Please answer this.', 'q-kind': 'Pick one.' });
    expect(answerErrors([KIND], { 'q-kind': 'Spaceship' })).toEqual({ 'q-kind': 'Pick one of the options.' });
    expect(answerErrors([MODEL], { 'q-model': '   ' })).toEqual({ 'q-model': 'Please answer this.' });
    expect(answerErrors([MODEL, KIND, AVOID], { 'q-model': 'Civic', 'q-kind': 'SUV' })).toEqual({});
  });

  it('sends only non-blank, trimmed answers', () => {
    expect(answersToSend([MODEL, KIND, AVOID], { 'q-model': ' Civic ', 'q-kind': 'SUV', 'q-avoid': ' ' })).toEqual([
      { questionId: 'q-model', answer: 'Civic' },
      { questionId: 'q-kind', answer: 'SUV' },
    ]);
  });
});
