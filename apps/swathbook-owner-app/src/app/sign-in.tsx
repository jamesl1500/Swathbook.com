import { Button, FormMessage, LogoMark, Screen, space, Text, TextField } from '@swathbook/mobile/design-system';
import * as WebBrowser from 'expo-web-browser';
import { Lock, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { signIn } from '@/data/auth';
import { webUrl } from '@/lib/config';

// name@domain.tld. Dots only separate domain labels, so matching never backtracks.
const EMAIL = /^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/;

/**
 * Sign in with the same email and password as the web dashboard. Accounts
 * and businesses are created on the website.
 */
export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!EMAIL.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      // The layout switches to the app as soon as the session arrives.
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']} contentStyle={styles.content}>
      <View style={styles.header}>
        <LogoMark size={44} />
        <Text variant="label" tone="brand">
          Swathbook for Business
        </Text>
        <Text variant="title">Run your day</Text>
        <Text tone="soft">Sign in with your Swathbook email and password to see today&rsquo;s jobs, answer requests and get paid.</Text>
      </View>

      <View style={styles.form}>
        <TextField
          label="Email"
          icon={Mail}
          value={email}
          onChangeText={setEmail}
          placeholder="you@business.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
        />
        <TextField
          label="Password"
          icon={Lock}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          labelAction={
            <Button variant="ghost" size="sm" onPress={() => WebBrowser.openBrowserAsync(webUrl('/auth/forgot_password'))}>
              Forgot it?
            </Button>
          }
        />
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <Button size="lg" block loading={busy} onPress={submit}>
          Sign in
        </Button>
      </View>

      <Text variant="small" tone="soft" align="center">
        New to Swathbook?{' '}
        <Text variant="smallStrong" tone="brand" onPress={() => WebBrowser.openBrowserAsync(webUrl('/auth/signup'))} role="link">
          Get your booking link on the website
        </Text>
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
    flexGrow: 1,
  },
  header: {
    gap: space[3],
  },
  form: {
    gap: space[4],
  },
});
