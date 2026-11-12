import { ArrowRight, Bell, CalendarCheck, Inbox, Phone, Plus, Sparkles } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BookingStatusBadge } from '@/components/booking-status-badge';
import type { BookingStatus } from '@/data/types';
import {
  Avatar,
  Badge,
  BrandPin,
  Button,
  Card,
  CardTitle,
  Chip,
  colors,
  EmptyState,
  Eyebrow,
  FormMessage,
  IconButton,
  ListGroup,
  ListRow,
  Logo,
  MapGrid,
  OptionCard,
  PageDots,
  radius,
  Screen,
  SearchField,
  SegmentedTabs,
  space,
  Stat,
  StepProgress,
  Text,
  TextField,
  type ButtonVariant,
  type TextVariant,
} from '@/design-system';

/**
 * A living catalogue of the design system: every token and component as it
 * actually renders. Reached from Account › Design system.
 */
export default function DesignSystemScreen() {
  const [tab, setTab] = useState<'one' | 'two' | 'three'>('one');
  const [chip, setChip] = useState('Lawn care');
  const [option, setOption] = useState(0);
  const [search, setSearch] = useState('');

  return (
    <Screen edges={[]}>
      <MapGrid style={styles.hero}>
        <Logo tone="paper" />
        <Eyebrow tone="sky">Design system</Eyebrow>
        <Text variant="display" tone="paper">
          Built from the website
        </Text>
        <Text tone="sky">Warm paper, workwear navy and a safety-orange accent, over a faint map grid.</Text>
      </MapGrid>

      <Section title="Colors">
        <View style={styles.swatches}>
          {(
            [
              'paper',
              'paperDeep',
              'card',
              'line',
              'lineStrong',
              'ink',
              'inkSoft',
              'inkFaint',
              'brand50',
              'brand200',
              'brand500',
              'brand600',
              'brand800',
              'sky',
              'sun',
              'sunSoft',
              'clay',
              'claySoft',
            ] as const
          ).map((name) => (
            <View key={name} style={styles.swatch}>
              <View style={[styles.swatchChip, { backgroundColor: colors[name] }]} />
              <Text variant="caption">{name}</Text>
              <Text variant="mono" tone="faint" style={styles.hex}>
                {colors[name]}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Type">
        {(
          ['display', 'title', 'heading', 'subheading', 'stat', 'body', 'bodyStrong', 'small', 'smallStrong', 'caption', 'label', 'mono'] as TextVariant[]
        ).map((variant) => (
          <View key={variant} style={styles.typeRow}>
            <Text variant="mono" tone="faint" style={styles.typeName}>
              {variant}
            </Text>
            <Text variant={variant} numberOfLines={1} style={styles.flex}>
              Book the job
            </Text>
          </View>
        ))}
      </Section>

      <Section title="Buttons">
        {(['primary', 'accent', 'secondary', 'ghost', 'danger'] as ButtonVariant[]).map((variant) => (
          <View key={variant} style={styles.wrap}>
            <Button variant={variant} size="sm">
              Small
            </Button>
            <Button variant={variant}>{variant}</Button>
          </View>
        ))}
        <MapGrid style={styles.inverseRow}>
          <Button variant="inverse" iconRight={ArrowRight}>
            Inverse
          </Button>
        </MapGrid>
        <Button size="lg" block icon={CalendarCheck}>
          Large, full width, with icon
        </Button>
        <View style={styles.wrap}>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <IconButton icon={Phone} label="Call" />
          <IconButton icon={Plus} label="Add" variant="primary" />
          <IconButton icon={Bell} label="Notifications" variant="ghost" />
        </View>
      </Section>

      <Section title="Badges & chips">
        <View style={styles.wrap}>
          {(['pending_payment', 'requested', 'confirmed', 'in_progress', 'completed', 'cancelled'] as BookingStatus[]).map((s) => (
            <BookingStatusBadge key={s} status={s} />
          ))}
          <Badge tone="ink" icon={Sparkles}>
            New
          </Badge>
        </View>
        <View style={styles.wrap}>
          {['Lawn care', 'Detailing', 'Pool service'].map((label) => (
            <Chip key={label} selected={chip === label} onPress={() => setChip(label)}>
              {label}
            </Chip>
          ))}
        </View>
        <View style={styles.wrap}>
          {['8:30 AM', '11:00 AM', '1:30 PM'].map((label, i) => (
            <Chip key={label} shape="tile" selected={i === 0}>
              {label}
            </Chip>
          ))}
        </View>
      </Section>

      <Section title="Fields">
        <SearchField value={search} onChangeText={setSearch} placeholder="Search businesses" />
        <TextField label="Full name" placeholder="Jordan Rivera" hint="As it should appear on receipts." />
        <TextField label="Email" defaultValue="jordan@" error="Enter a valid email address." />
        <FormMessage tone="success">Saved. Your changes are live.</FormMessage>
        <FormMessage tone="info">Deposits are refunded if you cancel in time.</FormMessage>
        <FormMessage tone="error">That time was just taken.</FormMessage>
      </Section>

      <Section title="Cards">
        <Card>
          <CardTitle action={<Badge tone="brand">3</Badge>}>Card title</CardTitle>
          <Text tone="soft">The default card: white on paper, 24pt corners, a hairline border.</Text>
        </Card>
        <Card variant="raised">
          <Text tone="soft">Raised, with the website’s card shadow.</Text>
        </Card>
        <Card variant="deep">
          <Text variant="label">Deep</Text>
          <Text tone="soft">For grouping inside a screen.</Text>
        </Card>
        <View style={styles.wrap}>
          <Stat label="Upcoming" value={3} />
          <Stat label="Spent" value="$412" hint="This year" />
        </View>
        {[0, 1].map((i) => (
          <OptionCard
            key={i}
            title={i === 0 ? 'Mow, edge & blow' : 'Spring cleanup'}
            meta={i === 0 ? '45 min' : '3 hr'}
            value={i === 0 ? '$45' : 'From $185'}
            selected={option === i}
            onPress={() => setOption(i)}
          />
        ))}
      </Section>

      <Section title="Lists & tabs">
        <SegmentedTabs
          label="Example"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'one', label: 'Upcoming', badge: 2 },
            { id: 'two', label: 'Past' },
            { id: 'three', label: 'Cancelled' },
          ]}
        />
        <ListGroup>
          <ListRow icon={Bell} title="With a value" trailing="Email" />
          <ListRow icon={Phone} title="Tappable" subtitle="With a subtitle" onPress={() => {}} />
          <ListRow title="No icon" trailing={<Badge tone="sun">Soon</Badge>} />
        </ListGroup>
      </Section>

      <Section title="Progress">
        <StepProgress total={3} current={1} />
        <MapGrid style={styles.inverseRow}>
          <PageDots total={3} current={0} tone="paper" />
        </MapGrid>
      </Section>

      <Section title="Empty state">
        <EmptyState icon={Inbox} title="Nothing here yet" action={<Button size="sm">Add one</Button>}>
          Say what goes here and how to add it.
        </EmptyState>
      </Section>

      <Section title="Brand">
        <View style={[styles.wrap, styles.center]}>
          <Logo />
          <BrandPin size={24} />
          <Avatar name="Greenline Lawn" color="#2f6b3a" />
          <Avatar name="Clearview" />
          <Avatar name="Pale Brand" color="#ffe6d6" />
        </View>
        <MapGrid tone="light" style={styles.grid}>
          <Text variant="label" tone="brand">
            Map grid, light
          </Text>
        </MapGrid>
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.sheet,
    padding: space[6],
    gap: space[3],
  },
  section: {
    gap: space[3],
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[3],
  },
  swatch: {
    width: 96,
  },
  swatchChip: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: space[1],
  },
  hex: {
    fontSize: 11,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  typeName: {
    width: 92,
    fontSize: 11,
  },
  flex: {
    flex: 1,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  center: {
    alignItems: 'center',
  },
  inverseRow: {
    borderRadius: radius.card,
    padding: space[4],
  },
  grid: {
    height: 96,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
