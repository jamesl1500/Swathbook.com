import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Camera, CircleHelp, CircleUser, House, ImageMinus, LogOut, Mail, Palette, Phone, ShieldCheck, Trash2, UserPen } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { formatAddress } from '@/components/address';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { useAvatarUrl, useDeleteAccount, useMyDetails, useRemoveMyAvatar, useSetMyAvatar } from '@/data/api';
import { signOut, useAuth } from '@/data/auth';
import { Avatar, Card, FormMessage, ListGroup, ListRow, Logo, PageHeader, Screen, SectionHeader, space, Text } from '@/design-system';
import { config } from '@/lib/config';
import { confirm, notify } from '@/lib/confirm';
import { pickProfilePhoto } from '@/lib/photo';

export default function AccountScreen() {
  const { user } = useAuth();

  return (
    <Screen>
      <PageHeader eyebrow="Account" title={user ? 'You' : 'Account'} />
      {user ? <SignedIn /> : (
        <SignInPrompt icon={CircleUser} title="Your Swathbook account">
          Sign in to book, see your jobs, and move or cancel them without calling.
        </SignInPrompt>
      )}
      <About />
    </Screen>
  );
}

async function onSignOut() {
  if (await confirm({ title: 'Sign out?', message: 'You can sign back in any time with a code.', confirmLabel: 'Sign out', cancelLabel: 'Stay' })) {
    await signOut();
  }
}

function SignedIn() {
  const { user } = useAuth();
  const details = useMyDetails();
  const deletion = useDeleteAccount();
  const setAvatar = useSetMyAvatar();
  const removeAvatar = useRemoveMyAvatar();
  const avatarPath = details.data?.avatar_path ?? null;
  const avatarUrl = useAvatarUrl(avatarPath);
  const name = details.data?.full_name || user?.email || 'You';
  const home = details.data?.home_address;
  const savingPhoto = setAvatar.isPending || removeAvatar.isPending;
  const photoError = setAvatar.error ?? removeAvatar.error;

  async function openAvatarEdit() {
    let photo;
    try {
      photo = await pickProfilePhoto();
    } catch (error) {
      console.warn('[photo]', error);
      notify("Couldn't use that photo", 'Try a different one.');
      return;
    }
    if (photo) setAvatar.mutate(photo);
  }

  async function onRemovePhoto() {
    const ok = await confirm({ title: 'Remove your photo?', message: 'Your initials show instead.', confirmLabel: 'Remove', destructive: true });
    if (ok) removeAvatar.mutate(undefined);
  }

  async function onDelete() {
    const ok = await confirm({
      title: 'Delete your account?',
      message:
        'This deletes your Swathbook login. Bookings stay with the businesses you booked, and you can still manage them from their emails.',
      confirmLabel: 'Delete account',
      cancelLabel: 'Keep it',
      destructive: true,
    });
    if (!ok) return;
    deletion.mutate(undefined, { onSuccess: () => signOut() });
  }

  return (
    <>
      <Card style={styles.profile}>
        <Avatar
          name={name}
          size="lg"
          imageUri={avatarPath ? avatarUrl.data : null}
          cacheKey={avatarPath}
          onPress={openAvatarEdit}
          label={avatarPath ? 'Change your photo' : 'Add a photo'}
          busy={savingPhoto}
        />
        <View style={styles.flex}>
          <Text variant="subheading" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="small" tone="soft" numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
      </Card>

      {photoError ? <FormMessage tone="error">{photoError.message}</FormMessage> : null}

      <View>
        <SectionHeader title="Your details" />
        <ListGroup>
          <ListRow icon={CircleUser} title="Name" subtitle={name} />
          <ListRow icon={Mail} title="Email" subtitle={`${user?.email ?? ''}`} />
          <ListRow icon={Phone} title="Phone" subtitle={details.data?.phone || 'Not added'} />
          <ListRow icon={House} title="Home address" subtitle={home ? formatAddress(home) : 'Not added'} />
          <ListRow icon={UserPen} title="Edit your details" href="/edit-details" />
          <ListRow icon={Camera} title={avatarPath ? 'Change photo' : 'Add a photo'} onPress={openAvatarEdit} />
          {avatarPath ? <ListRow icon={ImageMinus} title="Remove photo" destructive onPress={onRemovePhoto} /> : null}
        </ListGroup>
      </View>

      {deletion.isError ? <FormMessage tone="error">{deletion.error.message}</FormMessage> : null}

      <ListGroup>
        <ListRow icon={LogOut} title="Sign out" onPress={onSignOut} />
        <ListRow icon={Trash2} title={deletion.isPending ? 'Deleting…' : 'Delete account'} destructive onPress={onDelete} />
      </ListGroup>
    </>
  );
}

function About() {
  return (
    <>
      <View>
        <SectionHeader title="About" />
        <ListGroup>
          <ListRow icon={CircleHelp} title="Help & contact" onPress={() => WebBrowser.openBrowserAsync(`${config.siteUrl}/contact`)} />
          <ListRow icon={ShieldCheck} title="Privacy" onPress={() => WebBrowser.openBrowserAsync(`${config.siteUrl}/privacy`)} />
          <ListRow icon={Palette} title="Design system" subtitle="Every component in the app's library" href="/design-system" />
        </ListGroup>
      </View>

      <View style={styles.footer}>
        <Logo size={24} />
        <Text variant="caption" tone="faint">
          Version {Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  footer: {
    alignItems: 'center',
    gap: space[2],
    paddingTop: space[4],
  },
});
