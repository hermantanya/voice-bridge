import { Pressable, StyleSheet, Text, View } from "react-native";

import { LANGUAGES, languageLabel, type LanguageCode } from "../config";

type SettingsScreenProps = {
  myLang: LanguageCode;
  onMyLangChange: (lang: LanguageCode) => void;
  onBack: () => void;
};

export function SettingsScreen({
  myLang,
  onMyLangChange,
  onBack,
}: SettingsScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>My language</Text>
      <Text style={styles.subtitle}>
        Pick the language you speak. You'll hear the other person in this same
        language.
      </Text>

      <View style={styles.card}>
        {LANGUAGES.map((lang) => {
          const active = lang.code === myLang;
          return (
            <Pressable
              key={lang.code}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => onMyLangChange(lang.code)}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {lang.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.exampleCard}>
        <Text style={styles.exampleTitle}>Tip</Text>
        <Text style={styles.exampleText}>
          Each device should use the language spoken on that device.
        </Text>
        <Text style={styles.exampleText}>
          Leave and rejoin the room after changing language.
        </Text>
      </View>

      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>Save and go back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 24,
    paddingTop: 64,
  },
  title: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  option: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  optionActive: {
    backgroundColor: "#1d4ed8",
    borderColor: "#3b82f6",
  },
  optionText: {
    color: "#cbd5e1",
    fontSize: 18,
    fontWeight: "600",
  },
  optionTextActive: {
    color: "#ffffff",
  },
  exampleCard: {
    marginTop: 20,
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  exampleTitle: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "600",
  },
  exampleText: {
    color: "#94a3b8",
    fontSize: 15,
  },
  backButton: {
    marginTop: 24,
    backgroundColor: "#3b82f6",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  backButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
