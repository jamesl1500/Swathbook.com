import { CircleAlert, Search, X, type LucideIcon } from 'lucide-react-native';
import { useId, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, radius, shadows, space } from '../tokens';
import { Text } from './text';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  /** Helper text under the field. Hidden while there's an error. */
  hint?: ReactNode;
  error?: string;
  /** Something on the right of the label, e.g. a "Forgot?" link. */
  labelAction?: ReactNode;
  icon?: LucideIcon;
  /** Rendered inside the field on the right. */
  accessory?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Label + input + hint/error, laid out like the website's <Field>. Typed text
 * is always 16px, which also stops mobile Safari zooming in on web.
 */
export function TextField({
  label,
  hint,
  error,
  labelAction,
  icon: Icon,
  accessory,
  style,
  editable = true,
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const errorId = useId();
  const invalid = Boolean(error);

  return (
    <View style={style}>
      {label || labelAction ? (
        <View style={styles.labelRow}>
          {label ? <Text variant="smallStrong">{label}</Text> : <View />}
          {labelAction}
        </View>
      ) : null}
      <View
        style={[
          styles.control,
          focused && styles.focused,
          invalid && styles.invalid,
          focused && invalid && styles.invalidFocused,
          !editable && styles.disabled,
        ]}
      >
        {Icon ? <Icon size={18} color={colors.inkFaint} strokeWidth={2.25} aria-hidden /> : null}
        <TextInput
          aria-label={label}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          editable={editable}
          placeholderTextColor={colors.inkFaint}
          selectionColor={colors.brand500}
          cursorColor={colors.brand600}
          style={[styles.input, webNoOutline]}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...props}
        />
        {accessory}
      </View>
      {hint && !error ? (
        <Text variant="small" tone="faint" style={styles.below}>
          {hint}
        </Text>
      ) : null}
      {error ? (
        <View style={[styles.below, styles.errorRow]} nativeID={errorId} role="alert">
          <CircleAlert size={16} color={colors.clay} strokeWidth={2.25} aria-hidden />
          <Text variant="small" tone="clay" style={styles.errorText}>
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** A search box: magnifier on the left, clear button once something is typed. */
export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
  ...props
}: Omit<TextFieldProps, 'icon' | 'accessory' | 'label'> & { value: string; onChangeText: (text: string) => void }) {
  return (
    <TextField
      icon={Search}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      returnKeyType="search"
      autoCorrect={false}
      autoCapitalize="none"
      aria-label={placeholder}
      accessory={
        value ? (
          <Pressable
            role="button"
            aria-label="Clear search"
            hitSlop={12}
            onPress={() => onChangeText('')}
            style={styles.clear}
          >
            <X size={14} color={colors.paper} strokeWidth={3} aria-hidden />
          </Pressable>
        ) : null
      }
      {...props}
    />
  );
}

/** Browsers draw their own outline on a focused input; the control's ring replaces it. */
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space[3],
    marginBottom: space[1.5],
  },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2.5],
    minHeight: 48,
    paddingHorizontal: space[3.5],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    boxShadow: shadows.inputInset,
  },
  focused: {
    borderColor: colors.brand500,
    boxShadow: shadows.focusRing,
  },
  invalid: {
    borderColor: colors.clay,
  },
  invalidFocused: {
    boxShadow: shadows.errorRing,
  },
  disabled: {
    opacity: 0.6,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: space[3],
    fontFamily: fonts.sans.regular,
    fontSize: 16,
    color: colors.ink,
  },
  below: {
    marginTop: space[1.5],
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1.5],
  },
  errorText: {
    flex: 1,
  },
  clear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.inkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
