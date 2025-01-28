import * as DocumentPicker from "expo-document-picker";
import FastMqttFiletransfer from "fast-mqtt-filetransfer";
import React, { useState, useEffect } from "react";
import {
  Button,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
  Alert,
} from "react-native";

import { Picker } from "@react-native-picker/picker";

type MqttConnectionStatusChangeEvent = {
  connected: boolean;
};

type FileTransferProgressEvent = {
  chunkIndex: number;
  totalChunks: number;
  percentage: number;
};

export default function App() {
  const [schema, setSchema] = useState("ws"); // Default schema
  const [host, setHost] = useState("10.50.1.58");
  const [port, setPort] = useState("9001");
  const [path, setPath] = useState("/mqtt"); // Default path for ws/wss
  const [filePath, setFilePath] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [topic, setTopic] = useState("test/topic");
  const [message, setMessage] = useState("Not connected");
  const [chunkSize, setChunkSize] = useState("1024"); // Default chunk size in KB
  const [progressPercentage, setProgressPercentage] = useState(0);

  useEffect(() => {
    const progressListener = FastMqttFiletransfer.addListener(
      "onFileTransferProgress",
      (event: FileTransferProgressEvent) => {
        setProgressPercentage(event.percentage.toFixed(1));
      }
    );

    const connectionListener = FastMqttFiletransfer.addListener(
      "onMqttStateChanged",
      (event: MqttConnectionStatusChangeEvent) => {
        setMessage(event.connected ? "Connected" : "Not connected");
      }
    );

    return () => {
      progressListener.remove();
      connectionListener.remove();
    };
  }, []);

  const initializeMqtt = async () => {
    try {
      await FastMqttFiletransfer.initializeMqtt(
        schema,
        host,
        parseInt(port, 10),
        schema === "ws" || schema === "wss" ? path : undefined, // Add path only for ws/wss
      );
      setMessage("Connecting...");
    } catch (error) {
      setMessage("Failed to connect");
    }
  };

  const sendFile = async (useNativeChunking: boolean) => {
    try {
      if (!filePath || fileSize === 0) {
        Alert.alert("Error", "No file selected or file size invalid");
        return;
      }

      const chunkSizeInBytes = parseInt(chunkSize, 10) * 1024;
      const totalChunks = Math.ceil(fileSize / chunkSizeInBytes);

      if (useNativeChunking) {
        const success = await FastMqttFiletransfer.sendFile(
          filePath,
          "base64",
          topic,
          chunkSizeInBytes,
          undefined // Native chunking: omit chunkIndex
        );

        if (success) {
          Alert.alert("Success", "File sent successfully!");
          setProgressPercentage(0);
        } else {
          Alert.alert("Error", "Failed to send file");
        }
      } else {
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          const success = await FastMqttFiletransfer.sendFile(
            filePath,
            "base64",
            topic,
            chunkSizeInBytes,
            chunkIndex,
          );

          if (!success) {
            Alert.alert(
              "Error",
              `Failed to send chunk ${chunkIndex + 1}/${totalChunks}`,
            );
            return;
          }
        }

        Alert.alert("Success", "File sent successfully in chunks");
        setProgressPercentage(0);
      }
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        if (result.assets && result.assets.length > 0) {
          const selectedFile = result.assets[0];
          setFilePath(selectedFile.uri.replace("file://", ""));
          setFileSize(selectedFile.size ?? 0);
          Alert.alert(
            "File Selected",
            `You picked: ${selectedFile.name} (${(
              selectedFile.size / 1024
            ).toFixed(2)} KB)`
          );
        } else {
          Alert.alert("Error", "No file selected");
        }
      } else {
        Alert.alert("Cancelled", "No file selected");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick a file: " + error.message);
    }
  };

  const handlePublishTest = async () => {
    try {
      await FastMqttFiletransfer.publishTestMessage(topic);
    } catch (e) {
      console.error("Failed to publish test message: " + e.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.container}>
        <Text style={styles.header}>MQTT File Transfer Example</Text>
        <Group name="MQTT Connection">
          <Picker
            selectedValue={schema}
            onValueChange={(value) => setSchema(value)}
            style={styles.picker}
          >
            <Picker.Item label="MQTT (tcp)" value="mqtt" />
            <Picker.Item label="MQTTS (ssl)" value="mqtts" />
            <Picker.Item label="WebSocket (ws)" value="ws" />
            <Picker.Item label="WebSocket Secure (wss)" value="wss" />
          </Picker>
          <TextInput
            style={styles.input}
            placeholder="Host"
            value={host}
            onChangeText={setHost}
          />
          <TextInput
            style={styles.input}
            placeholder="Port"
            value={port}
            onChangeText={setPort}
            keyboardType="numeric"
          />
          {(schema === "ws" || schema === "wss") && (
            <TextInput
              style={styles.input}
              placeholder="Path (e.g., /mqtt)"
              value={path}
              onChangeText={setPath}
            />
          )}
          <Button title="Initialize MQTT" onPress={initializeMqtt} />
          <Text style={styles.status}>{message}</Text>
        </Group>
        <Group name="File Transfer">
          <TextInput
            style={styles.input}
            placeholder="Destination Topic"
            value={topic}
            onChangeText={setTopic}
          />
          <TextInput
            style={styles.input}
            placeholder="Chunk Size (KB)"
            value={chunkSize}
            onChangeText={setChunkSize}
            keyboardType="numeric"
          />
          <Button title="Pick a File" onPress={pickFile} />
          <Text style={styles.status}>
            {filePath
              ? `Selected File: ${filePath} (${(fileSize / 1024).toFixed(
                2
              )} KB)`
              : "No file selected"}
          </Text>
          <Text style={styles.status}>
            Transfer Progress: {progressPercentage}%
          </Text>
          <View style={styles.buttonContainer}>
            <Button
              title="Send File (Native Chunking)"
              onPress={() => sendFile(true)}
            />
          </View>
          <View style={styles.buttonContainer}>
            <Button
              title="Send File (JS Chunking)"
              onPress={() => sendFile(false)}
            />
          </View>
          <View style={styles.buttonContainer}>
            <Button title="Send Test Message" onPress={handlePublishTest} />
          </View>
        </Group>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group(props: { name: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupHeader}>{props.name}</Text>
      {props.children}
    </View>
  );
}

const styles = {
  header: {
    fontSize: 30,
    margin: 20,
  },
  groupHeader: {
    fontSize: 20,
    marginBottom: 20,
  },
  group: {
    margin: 20,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 20,
  },
  container: {
    flex: 1,
    backgroundColor: "#eee",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  picker: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    marginBottom: 10,
  },
  status: {
    marginTop: 10,
    fontSize: 16,
    marginBottom: 10,
  },
  buttonContainer: {
    marginBottom: 10,
  },
};
