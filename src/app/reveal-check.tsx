import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  CountUp,
  RevealGate,
  ScrollReveal,
  useSettledMount,
} from '@/components/common/animations';
import { BarChart, DonutChart } from '@/components/ui/charts';

const KPI_DELAYS = [0, 70, 140, 210, 280];
const PANEL_DELAYS = [180, 250, 320, 380, 410, 440];

function Tag({ id, children }: { id: string; children: ReactNode }) {
  return <View testID={id}>{children}</View>;
}

export default function RevealCheck() {
  const [shown, setShown] = useState(false);
  const [bump, setBump] = useState(0);
  const open = useSettledMount(shown);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable testID="mount" onPress={() => setShown(true)} style={{ padding: 10, backgroundColor: '#ddd' }}>
          <Text>Mount</Text>
        </Pressable>
        <Pressable testID="bump" onPress={() => setBump((n) => n + 1)} style={{ padding: 10, backgroundColor: '#ddd' }}>
          <Text>Bump</Text>
        </Pressable>
      </View>
      {shown ? (
        <RevealGate open={open}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {KPI_DELAYS.map((delay, index) => (
              <ScrollReveal key={delay} delay={delay}>
                <View testID={`reveal-kpi-${delay}`} style={{ padding: 12, borderWidth: 1, width: 140 }}>
                  <Tag id={`count-kpi-${delay}`}>
                    {index === 1 ? (
                      <CountUp value={87.5 + bump} decimals={1} suffix="%" />
                    ) : (
                      <CountUp value={40 + index * 7 + bump} />
                    )}
                  </Tag>
                </View>
              </ScrollReveal>
            ))}
          </View>
          {PANEL_DELAYS.map((delay) => (
            <ScrollReveal key={delay} delay={delay}>
              <View testID={`reveal-panel-${delay}`} style={{ padding: 12, borderWidth: 1 }}>
                {delay === 180 ? (
                  <BarChart
                    bars={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ key: `${n}`, label: `D${n}`, value: n * 3 }))}
                    height={160}
                  />
                ) : null}
                {delay === 250 ? (
                  <DonutChart value={0.72} size={120} thickness={12} gap={6} animationDelay={250}>
                    <Tag id="count-donut">
                      <CountUp value={72 + bump} suffix="%" />
                    </Tag>
                  </DonutChart>
                ) : null}
                {delay === 320 ? (
                  <Tag id="count-reason">
                    <CountUp value={19 + bump} />
                  </Tag>
                ) : null}
                {delay === 410 ? (
                  <Tag id="count-leader">
                    <CountUp value={33 + bump} />
                  </Tag>
                ) : null}
                <Text>{`panel ${delay}`}</Text>
              </View>
            </ScrollReveal>
          ))}
        </RevealGate>
      ) : null}
    </ScrollView>
  );
}
