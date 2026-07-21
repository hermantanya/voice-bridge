import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { TranscriptEntry } from "../hooks/useSocket";
import { formatRelativeTime } from "../utils/timeFormat";

type TranscriptPanelProps = {
  entries: TranscriptEntry[];
};

function TranscriptCell({
  entry,
  nowMs,
  align,
}: {
  entry: TranscriptEntry;
  nowMs: number;
  align: "left" | "right";
}) {
  return (
    <View style={[styles.cellBody, align === "right" && styles.cellBodyRight]}>
      <Text style={[styles.sourceText, align === "right" && styles.textRight]}>
        {entry.sourceText}
      </Text>
      <Text style={[styles.translatedText, align === "right" && styles.textRight]}>
        {entry.translatedText}
      </Text>
      <Text style={[styles.timeText, align === "right" && styles.textRight]}>
        {formatRelativeTime(entry.receivedAt, nowMs)}
      </Text>
    </View>
  );
}

export function TranscriptPanel({ entries }: TranscriptPanelProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 10_000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [entries.length]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Transcript</Text>
        <View style={styles.columnHeaders}>
          <Text style={[styles.columnHeader, styles.leftHeader]}>Others</Text>
          <Text style={[styles.columnHeader, styles.rightHeader]}>You</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        {entries.map((entry) => (
          <View key={entry.id} style={styles.row}>
            <View style={[styles.column, styles.leftColumn]}>
              {entry.direction === "received" ? (
                <TranscriptCell entry={entry} nowMs={nowMs} align="left" />
              ) : null}
            </View>
            <View style={styles.divider} />
            <View style={[styles.column, styles.rightColumn]}>
              {entry.direction === "sent" ? (
                <TranscriptCell entry={entry} nowMs={nowMs} align="right" />
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: 16,
    backgroundColor: "#1e293b",
    borderRadius: 16,
    overflow: "hidden",
    minHeight: 160,
  },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 10,
  },
  title: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
  },
  columnHeaders: {
    flexDirection: "row",
  },
  columnHeader: {
    flex: 1,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  leftHeader: {
    paddingRight: 8,
  },
  rightHeader: {
    paddingLeft: 8,
    textAlign: "right",
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 48,
  },
  column: {
    flex: 1,
    paddingVertical: 4,
  },
  leftColumn: {
    paddingRight: 6,
  },
  rightColumn: {
    paddingLeft: 6,
    alignItems: "flex-end",
  },
  divider: {
    width: 1,
    backgroundColor: "#334155",
  },
  cellBody: {
    gap: 4,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#0f172a",
    maxWidth: "100%",
  },
  cellBodyRight: {
    alignSelf: "flex-end",
  },
  textRight: {
    textAlign: "right",
  },
  sourceText: {
    color: "#e2e8f0",
    fontSize: 15,
    lineHeight: 20,
  },
  translatedText: {
    color: "#60a5fa",
    fontSize: 14,
    lineHeight: 19,
  },
  timeText: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 2,
  },
});
