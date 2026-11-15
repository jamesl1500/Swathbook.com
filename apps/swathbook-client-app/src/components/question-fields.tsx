import { StyleSheet, View } from 'react-native';

import { Chip, space, Text, TextField } from '@swathbook/mobile/design-system';
import { MAX_ANSWER_LENGTH, type QuestionToAsk } from '@/lib/questions';

/**
 * The chosen services' questions ("Make and model?"), grouped by service:
 * a text field for written answers, a row of chips for pick-one questions.
 */
export function QuestionFields({
  questions,
  answers,
  errors,
  onChange,
}: {
  questions: QuestionToAsk[];
  answers: Record<string, string>;
  errors: Record<string, string>;
  onChange: (questionId: string, answer: string) => void;
}) {
  const groups = [...new Set(questions.map((question) => question.serviceName))];

  return (
    <View style={styles.stack}>
      {groups.map((serviceName) => (
        <View key={serviceName} style={styles.stack}>
          {groups.length > 1 ? <Text variant="label">{serviceName}</Text> : null}
          {questions
            .filter((question) => question.serviceName === serviceName)
            .map((question) => {
              const label = question.required ? question.prompt : `${question.prompt} (optional)`;
              const value = answers[question.id] ?? '';
              const error = errors[question.id];
              if (question.kind === 'choice') {
                return (
                  <View key={question.id} style={styles.choice}>
                    <Text variant="smallStrong">{label}</Text>
                    <View style={styles.chips} role="radiogroup" aria-label={question.prompt}>
                      {question.options.map((option) => (
                        <Chip key={option} selected={value === option} onPress={() => onChange(question.id, option)}>
                          {option}
                        </Chip>
                      ))}
                    </View>
                    {error ? (
                      <Text variant="small" tone="clay" role="alert">
                        {error}
                      </Text>
                    ) : null}
                  </View>
                );
              }
              return (
                <TextField
                  key={question.id}
                  label={label}
                  value={value}
                  onChangeText={(text) => onChange(question.id, text)}
                  maxLength={MAX_ANSWER_LENGTH}
                  error={error}
                />
              );
            })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[4],
  },
  choice: {
    gap: space[2],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
});
