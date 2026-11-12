import { MapPin } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { BookingAddress } from '@/data/types';
import { space, TextField } from '@/design-system';

export type AddressValue = { line1: string; line2: string; city: string; region: string; postal_code: string };

export const emptyAddress: AddressValue = { line1: '', line2: '', city: '', region: '', postal_code: '' };

export function toAddressValue(address: BookingAddress | null | undefined): AddressValue {
  if (!address) return emptyAddress;
  return {
    line1: address.line1 ?? '',
    line2: address.line2 ?? '',
    city: address.city ?? '',
    region: address.region ?? '',
    postal_code: address.postal_code ?? '',
  };
}

/** Street, unit, city, state and ZIP, with the platforms' address autofill hints. */
export function AddressFields({
  value,
  onChange,
  line1Label = 'Street address',
  error,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  line1Label?: string;
  /** Shown under the street field. */
  error?: string;
}) {
  const set = (key: keyof AddressValue) => (text: string) => onChange({ ...value, [key]: text });
  return (
    <View style={styles.stack}>
      <TextField
        label={line1Label}
        icon={MapPin}
        value={value.line1}
        onChangeText={set('line1')}
        autoComplete="street-address"
        textContentType="streetAddressLine1"
        error={error}
      />
      <TextField label="Apartment, unit, gate (optional)" value={value.line2} onChangeText={set('line2')} textContentType="streetAddressLine2" />
      <View style={styles.pair}>
        <TextField label="City" value={value.city} onChangeText={set('city')} textContentType="addressCity" style={styles.flex} />
        <TextField label="State" value={value.region} onChangeText={set('region')} textContentType="addressState" style={styles.state} />
      </View>
      <TextField
        label="ZIP code"
        value={value.postal_code}
        onChangeText={set('postal_code')}
        keyboardType="number-pad"
        autoComplete="postal-code"
        textContentType="postalCode"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[3],
  },
  pair: {
    flexDirection: 'row',
    gap: space[3],
  },
  flex: {
    flex: 1,
  },
  state: {
    width: 96,
  },
});
