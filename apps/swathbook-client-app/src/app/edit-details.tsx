import { router } from 'expo-router';
import { Phone, User } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AddressFields, toAddressValue, type AddressValue } from '@/components/address-fields';
import { Loading } from '@/components/query-state';
import { useMyDetails, useSaveMyDetails } from '@/data/api';
import type { MyDetails } from '@/data/types';
import { Button, FormMessage, Screen, SectionHeader, space, Text, TextField } from '@/design-system';

const PHONE = /^\+?[0-9 ().-]{7,20}$/;

export default function EditDetailsScreen() {
  const details = useMyDetails();
  if (details.isPending) return <Loading />;
  // The form starts from what was saved.
  return <DetailsForm initial={details.data ?? null} />;
}

function DetailsForm({ initial }: { initial: MyDetails | null }) {
  const [name, setName] = useState(initial?.full_name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [address, setAddress] = useState<AddressValue>(toAddressValue(initial?.home_address));
  const [errors, setErrors] = useState<{ name?: string; phone?: string; line1?: string }>({});
  const save = useSaveMyDetails();

  function submit() {
    const next = {
      name: name.trim().length < 2 ? 'Enter your name.' : undefined,
      phone: phone.trim() && !PHONE.test(phone.trim()) ? 'Enter a valid phone number.' : undefined,
      line1: address.line1.trim() && address.line1.trim().length < 3 ? 'Enter a street address, or leave it blank.' : undefined,
    };
    setErrors(next);
    if (next.name || next.phone || next.line1) return;
    // An empty street clears the saved home address.
    save.mutate({ fullName: name.trim(), phone: phone.trim(), address }, { onSuccess: () => router.back() });
  }

  return (
    <Screen
      edges={[]}
      footer={
        <Button size="lg" block loading={save.isPending} onPress={submit}>
          Save
        </Button>
      }
    >
      <Text tone="soft">
        Businesses see your name and phone when you book. Your email is your login, so it can&rsquo;t be changed here.
      </Text>
      <View style={styles.form}>
        <TextField label="Full name" icon={User} value={name} onChangeText={setName} autoComplete="name" textContentType="name" error={errors.name} />
        <TextField
          label="Phone"
          icon={Phone}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          hint="Optional. So the crew can reach you on the day."
          error={errors.phone}
        />
      </View>
      <View style={styles.form}>
        <SectionHeader title="Home address" />
        <Text variant="small" tone="soft">
          Fills in new bookings. Only you can see it until you book with a business. Clear the street to remove it.
        </Text>
        <AddressFields value={address} onChange={setAddress} error={errors.line1} />
      </View>
      {save.isError ? <FormMessage tone="error">{save.error.message}</FormMessage> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space[4],
  },
});
