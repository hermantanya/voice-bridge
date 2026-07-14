import { Pressable, StyleSheet, Text, View } from "react-native";

import { LANGUAGES, type LanguageCode } from "../config";

type SettingsScreenProps = {
  speakLang: LanguageCode;
  hearLang: LanguageCode;
  onSpeakLangChange: (lang: LanguageCode) => void;
  onHearLangChange: (lang: LanguageCode) => void;
  onBack: () => void;
};

function LanguagePicker({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: LanguageCode;
  onSelect: (lang: LanguageCode) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.options}>
        {LANGUAGES.map((lang) => {
          const active = lang.code === selected;
          return (
            <Pressable
              key={lang.code}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => onSelect(lang.code)}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {lang.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SettingsScreen({
  speakLang,
  hearLang,
  onSpeakLangChange,
  onHearLangChange,
  onBack,
}: SettingsScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Languages</Text>
      <Text style={styles.subtitle}>v1.0 supports English and Hebrew</Text>

      <View style={styles.card}>
        <LanguagePicker
          label="I speak"
          selected={speakLang}
          onSelect={onSpeakLangChange}
        />
        <LanguagePicker
          label="I hear"
          selected={hearLang}
          onSelect={onHearLangChange}
        />
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
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    gap: 24,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "600",
  },
  options: {
    flexDirection: "row",
    gap: 10,
  },
  option: {
    flex: 1,
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingVertical: 12,
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
    fontSize: 15,
    fontWeight: "600",
  },
  optionTextActive: {
    color: "#ffffff",
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
