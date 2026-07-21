import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { formatActiveConversationDuration } from "../utils/timeFormat";

type SpeakingTimeStatProps = {
  label: string;
  hint: string;
  billableMs: number;
  pending: boolean;
  highlighted?: boolean;
};

export function SpeakingTimeStat({
  label,
  hint,
  billableMs,
  pending,
  highlighted = false,
}: SpeakingTimeStatProps) {
  const settledMsRef = useRef(billableMs);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const flashAnim = useRef(new Animated.Value(1)).current;

  if (!pending) {
    settledMsRef.current = billableMs;
  }

  const displayMs = pending ? settledMsRef.current : billableMs;

  useEffect(() => {
    if (!pending) {
      pulseAnim.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [pending, pulseAnim]);

  useEffect(() => {
    if (pending) {
      return;
    }

    const previousMs = settledMsRef.current;
    if (billableMs === previousMs) {
      return;
    }

    settledMsRef.current = billableMs;
    flashAnim.setValue(0.35);
    Animated.timing(flashAnim, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, [billableMs, flashAnim, pending]);

  return (
    <View style={styles.statRow}>
      <View style={styles.statLabelBlock}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statHint}>{hint}</Text>
      </View>
      <View style={styles.valueBlock}>
        {pending ? (
          <Animated.View style={[styles.pendingDot, { opacity: pulseAnim }]} />
        ) : null}
        <Animated.Text
          style={[
            highlighted ? styles.statValueHighlight : styles.statValue,
            { opacity: flashAnim },
          ]}
        >
          {formatActiveConversationDuration(displayMs)}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  statLabelBlock: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
  },
  statLabel: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  statHint: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 14,
  },
  valueBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#60a5fa",
  },
  statValue: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    minWidth: 52,
    textAlign: "right",
  },
  statValueHighlight: {
    color: "#60a5fa",
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    minWidth: 52,
    textAlign: "right",
  },
});
