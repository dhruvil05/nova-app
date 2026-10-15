import { View } from 'react-native';

import { makeStyles } from '@/theme';

import { AppText } from '../AppText';

type Props = { role: 'user' | 'assistant'; text: string; streaming?: boolean };

export function ChatBubble({ role, text, streaming }: Props) {
  const styles = useStyles();
  const isUser = role === 'user';
  return (
    <View
      style={[styles.bubble, isUser ? styles.user : styles.assistant]}
      accessibilityLabel={`${isUser ? 'You' : 'Nova'}: ${text}`}>
      <AppText variant="body" color={isUser ? 'onAccent' : 'text'} selectable>
        {text}
        {streaming ? <AppText color="accent">{' ▍'}</AppText> : null}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bubble: { maxWidth: '84%', paddingHorizontal: 14, paddingVertical: 10 },
  user: {
    alignSelf: 'flex-end',
    backgroundColor: t.colors.accentStrong,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 6,
  },
  assistant: {
    alignSelf: 'flex-start',
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 6,
  },
}));
