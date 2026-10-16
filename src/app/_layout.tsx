import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';
import { Sora_300Light, Sora_500Medium, Sora_600SemiBold } from '@expo-google-fonts/sora';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';

import { migrate } from '@/db/migrate';
import { setupPlayer } from '@/services/player';
import { usePrivacy } from '@/store/privacy';
import { ThemeProvider, fonts, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync();
// The player must exist before any screen reads playback state, and Android
// requires it to be created while the app is in the foreground (it is, here).
setupPlayer();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [fonts.displayLight]: Sora_300Light,
    [fonts.display]: Sora_500Medium,
    [fonts.displayBold]: Sora_600SemiBold,
    [fonts.body]: DMSans_400Regular,
    [fonts.bodyMedium]: DMSans_500Medium,
    [fonts.bodySemiBold]: DMSans_600SemiBold,
  });

  // Fonts failing to load is not fatal: the app falls back to system fonts.
  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider>
      <SQLiteProvider databaseName="nova.db" onInit={migrate}>
        <AppShell />
      </SQLiteProvider>
    </ThemeProvider>
  );
}

/** Rendered once the database is migrated and the theme is available. */
function AppShell() {
  const theme = useTheme();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Re-lock private notes whenever the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') usePrivacy.getState().lock();
    });
    return () => sub.remove();
  }, []);

  const navigationTheme = useMemo(() => {
    const base = theme.isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: theme.isDark,
      colors: {
        ...base.colors,
        primary: theme.colors.accent,
        background: theme.colors.background,
        card: theme.colors.background,
        text: theme.colors.text,
        border: theme.colors.border,
        notification: theme.colors.accentStrong,
      },
    };
  }, [theme]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="note/[id]" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="file/[id]" />
        <Stack.Screen name="chats" />
        <Stack.Screen name="voice" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="player" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </NavigationThemeProvider>
  );
}
