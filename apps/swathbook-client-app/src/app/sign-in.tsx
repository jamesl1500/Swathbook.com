import { router } from 'expo-router';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getMyDetails, queryClient } from '@/data/api';
import { sendSignInCode, verifySignInCode } from '@/data/auth';
import { Button, FormMessage, LogoMark, Screen, space, Text, TextField } from '@/design-system';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Supabase's code length is a project setting (6 to 10 digits; the hosted
 * project sends 8). Accept the whole range so changing it never breaks sign-in.
 */
const CODE_MAX = 10;
const CODE = /^\d{6,10}$/;

/**
 * Sign in or create an account, in one flow: enter your email, then the
 * code we send. Use the same email you book with, and every booking
 * you've made with it shows up.
 */
export default function SignInScreen() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function sendCode() {
    if (!EMAIL.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendSignInCode(email);
      setStep('code');
      setNotice(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!CODE.test(code.trim())) {
      setError('Enter the code from the email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifySignInCode(email, code);
      // New here (or never finished setup)? Set the account up in place of this
      // screen; closing setup returns to wherever they were, e.g. a booking.
      const details = await queryClient
        .fetchQuery({ queryKey: ['me', 'details'], queryFn: getMyDetails })
        .catch(() => null);
      if (details && !details.onboarded_at) router.replace('/setup');
      else if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      await sendSignInCode(email);
      setNotice('We sent a new code.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <View style={styles.header}>
        <LogoMark size={40} />
        {step === 'email' ? (
          <>
            <Text variant="title">Sign in to Swathbook</Text>
            <Text tone="soft">
              Use the email you book with. We&rsquo;ll send you a code; no password needed. New here? This creates your account.
            </Text>
          </>
        ) : (
          <>
            <Text variant="title">Check your email</Text>
            <Text tone="soft">
              We sent a sign-in code to <Text variant="bodyStrong">{email.trim().toLowerCase()}</Text>.
            </Text>
          </>
        )}
      </View>

      {step === 'email' ? (
        <View style={styles.form}>
          <TextField
            label="Email"
            icon={Mail}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={sendCode}
            autoFocus
          />
          {error ? <FormMessage tone="error">{error}</FormMessage> : null}
          <Button size="lg" block loading={busy} onPress={sendCode}>
            Email me a code
          </Button>
        </View>
      ) : (
        <View style={styles.form}>
          <TextField
            label="Code"
            icon={ShieldCheck}
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, CODE_MAX))}
            placeholder="12345678"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            returnKeyType="done"
            onSubmitEditing={verify}
            maxLength={CODE_MAX}
            autoFocus
            hint="The code expires in an hour."
          />
          {error ? <FormMessage tone="error">{error}</FormMessage> : null}
          {notice ? <FormMessage tone="success">{notice}</FormMessage> : null}
          <Button size="lg" block loading={busy} onPress={verify}>
            Sign in
          </Button>
          <View style={styles.secondary}>
            <Button
              variant="ghost"
              size="sm"
              icon={ArrowLeft}
              onPress={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            >
              Different email
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onPress={resend}>
              Send a new code
            </Button>
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space[3],
  },
  form: {
    gap: space[4],
  },
  secondary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space[2],
  },
});
