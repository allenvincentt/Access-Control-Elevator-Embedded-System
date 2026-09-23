import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "@/constants/themeColor";

export type ScreenHeaderProps = {
  title: string;
  right?: ReactNode;
  left?: ReactNode;
};

export function ScreenHeader({
  title,
  right,
  left,
}: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      {left ? <View style={styles.left}>{left}</View> : null}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  left: {
    marginRight: spacing.xs,
  },
  text: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: colors.text,
    ...typography.title,
  },
  right: {
    alignItems: "flex-end",
  },
});

export default ScreenHeader;
