import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
  ScrollView,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getDeviceId } from "../src/device/id";
import { DeviceCommandHandler, type CommandLogEntry } from "../src/command/handler";
import { TorchCapability } from "../src/capabilities/torch";
import { BatteryCapability } from "../src/capabilities/battery";
import { VibrationCapability } from "../src/capabilities/vibration";
import { BrightnessCapability } from "../src/capabilities/brightness";
import { HapticsCapability } from "../src/capabilities/haptics";
import {
  DeviceConnectionService,
  type ConnectionStatus,
} from "../src/connection/service";
import { DEFAULT_SERVER_URL } from "../src/config";

const capabilities = [
  new TorchCapability(),
  new BatteryCapability(),
  new VibrationCapability(),
  new BrightnessCapability(),
  new HapticsCapability(),
];
const handler = new DeviceCommandHandler(capabilities);

const MAX_LOG_ENTRIES = 50;

export default function HomeScreen() {
  const [deviceId, setDeviceId] = useState<string>("...");
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [logs, setLogs] = useState<CommandLogEntry[]>([]);
  const serviceRef = useRef<DeviceConnectionService | null>(null);

  useEffect(() => {
    let mounted = true;
    void getDeviceId().then((id) => {
      if (!mounted) return;
      setDeviceId(id);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const unsub = handler.onLog((entry) => {
      setLogs((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (deviceId === "...") return;

    const service = new DeviceConnectionService({
      deviceId,
      deviceName: `${deviceId.slice(0, 8)}'s Phone`,
      handler,
      serverUrl,
    });
    serviceRef.current = service;

    const unsub = service.onStatusChange(setStatus);
    return () => {
      unsub();
      service.disconnect();
    };
  }, [deviceId]);

  const handleConnect = useCallback(() => {
    const svc = serviceRef.current;
    if (!svc) return;
    svc.setServerUrl(serverUrl);
    svc.connect();
  }, [serverUrl]);

  const handleDisconnect = useCallback(() => {
    serviceRef.current?.disconnect();
  }, []);

  const statusColor =
    status === "connected"
      ? "#4ade80"
      : status === "connecting" || status === "reconnecting"
        ? "#facc15"
        : "#f87171";

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Dost Device</Text>

        {/* Connection status */}
        <View style={styles.card}>
          <Text style={styles.label}>Connection</Text>
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={styles.value}>{status}</Text>
          </View>
        </View>

        {/* Device ID */}
        <View style={styles.card}>
          <Text style={styles.label}>Device ID</Text>
          <Text style={styles.mono}>{deviceId}</Text>
        </View>

        {/* Server URL */}
        <View style={styles.card}>
          <Text style={styles.label}>Server</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="ws://192.168.0.100:4000/device"
            placeholderTextColor="#6b7280"
          />
        </View>

        {/* Capabilities */}
        <View style={styles.card}>
          <Text style={styles.label}>Capabilities</Text>
          {capabilities.map((cap) => (
            <View key={cap.name} style={styles.row}>
              <Text style={styles.check}>✓</Text>
              <Text style={styles.value}>{cap.name}</Text>
              <Text style={styles.hint}>{cap.supportedCommands().length} commands</Text>
            </View>
          ))}
        </View>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.connectBtn, status === "connected" && styles.disabledBtn]}
            onPress={handleConnect}
            disabled={status === "connected"}
          >
            <Text style={styles.buttonText}>Connect</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.disconnectBtn, status === "disconnected" && styles.disabledBtn]}
            onPress={handleDisconnect}
            disabled={status === "disconnected"}
          >
            <Text style={styles.buttonText}>Disconnect</Text>
          </TouchableOpacity>
        </View>

        {/* Command Log */}
        <View style={styles.logCard}>
          <Text style={styles.label}>Command Log</Text>
          {logs.length === 0 ? (
            <Text style={styles.emptyLog}>
              No commands received yet. Commands from Dost will appear here.
            </Text>
          ) : (
            logs.map((entry) => (
              <View key={entry.id} style={styles.logEntry}>
                <View style={styles.logHeader}>
                  <View style={[styles.logDot, { backgroundColor: entry.success ? "#4ade80" : "#f87171" }]} />
                  <Text style={styles.logCommand}>{entry.command}</Text>
                  <Text style={styles.logTime}>{entry.timestamp}</Text>
                </View>
                {entry.result && (
                  <Text style={styles.logResult}>{JSON.stringify(entry.result)}</Text>
                )}
                {entry.error && (
                  <Text style={styles.logError}>{entry.error}</Text>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#111827",
  },
  container: {
    padding: 20,
    paddingTop: 40,
    paddingBottom: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#f9fafb",
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  value: {
    fontSize: 16,
    color: "#f9fafb",
  },
  mono: {
    fontSize: 13,
    color: "#a5b4fc",
    fontFamily: "monospace",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  check: {
    color: "#4ade80",
    fontSize: 16,
    fontWeight: "600",
  },
  hint: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: "auto",
  },
  input: {
    backgroundColor: "#111827",
    color: "#f9fafb",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    fontFamily: "monospace",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  connectBtn: {
    backgroundColor: "#22c55e",
  },
  disconnectBtn: {
    backgroundColor: "#ef4444",
  },
  disabledBtn: {
    opacity: 0.4,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  logCard: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  emptyLog: {
    color: "#6b7280",
    fontSize: 14,
    fontStyle: "italic",
  },
  logEntry: {
    borderBottomColor: "#374151",
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  logCommand: {
    color: "#e0e7ff",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "monospace",
  },
  logTime: {
    color: "#6b7280",
    fontSize: 12,
    marginLeft: "auto",
  },
  logResult: {
    color: "#86efac",
    fontSize: 12,
    fontFamily: "monospace",
    marginTop: 4,
    marginLeft: 16,
  },
  logError: {
    color: "#fca5a5",
    fontSize: 12,
    fontFamily: "monospace",
    marginTop: 4,
    marginLeft: 16,
  },
});
