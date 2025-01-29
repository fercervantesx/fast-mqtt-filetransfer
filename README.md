# FastMqttFileTransfer

**FastMqttFileTransfer** is an Expo Module that enables efficient and flexible file transfer over MQTT in React Native (Expo) apps. It supports both **JavaScript-side** and **native-side** file chunking, allowing you to send arbitrarily large files in small increments. It also tracks transfer progress and MQTT connection state in real time, so your UI can remain responsive.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
    - [Android](#android)
    - [iOS](#ios)
- [Usage](#usage)
    - [Import and Setup](#import-and-setup)
    - [Initialize MQTT](#initialize-mqtt)
    - [Sending Files](#sending-files)
        - [Native Chunking](#native-chunking)
        - [JS Chunking](#js-chunking)
    - [Publish a Test Message](#publish-a-test-message)
    - [Listening for Events](#listening-for-events)
- [API Reference](#api-reference)
- [Memory/Performance Tips](#memoryperformance-tips)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **MQTT Connection Management**: Connect to brokers supporting `mqtt`, `mqtts`, `ws`, or `wss`.
- **File Transfer**: Send files with:
    1. **Native chunking**: the module itself splits the file.
    2. **Sending a single chunk**: your app iterates chunks and calls native once per chunk.
- **Progress Events**: Real-time “onFileTransferProgress” with chunk index, total chunks, and percentage.
- **Connection Events**: Real-time “onMqttStateChanged” (connected/disconnected).
- **Flexible Encoding**: Out-of-the-box Base64 or UTF-8.
- **Test Message Publishing**: Quickly verify MQTT connectivity via a small sample message.

---

## Installation

1. **Install** from npm (or your private registry):
   ```bash
   npm install fast-mqtt-filetransfer
   # or 
   yarn add fast-mqtt-filetransfer
   ```
2. **Prebuild / Rebuild** if using managed Expo:
   ```bash
   npx expo prebuild
   ```
   or if using a bare React Native project, standard Gradle iOS/Android builds apply.

---

## Configuration

### Android
No special configuration is needed if you’re using Expo Modules. The library automatically injects the native code. If you have custom requirements (like versioned libraries or gradle settings), open your project’s `android/` folder in Android Studio to edit.

### iOS
In a standard Expo or RN environment, iOS project settings are handled automatically as well. If you manually link libraries, ensure that **CocoaMQTT** is installed via Cocoapods.

---

## Usage

### Import and Setup

```js
import FastMqttFileTransfer from 'fast-mqtt-filetransfer'; 
```

### Initialize MQTT

```js
await FastMqttFileTransfer.initializeMqtt(
  scheme,  // e.g. 'mqtt', 'mqtts', 'ws', 'wss'
  host,    // 'broker.emqx.io'
  port,    // e.g. 1883 for mqtt, 9001 for ws
  path     // optional, only needed if scheme is 'ws' or 'wss'; e.g. '/mqtt'
);
```
- **scheme**: `'mqtt' | 'mqtts' | 'ws' | 'wss'`
- **path**: only required for WebSocket-based connections.

### Sending Files

**Key Parameters**:
- **filePath**: Local file path on the device (e.g., from DocumentPicker).
- **encoding**: `'base64'` or `'utf8'` or `'none'`.
- **destinationTopic**: MQTT topic to publish to.
- **chunkSize**: Byte size for splitting data (e.g., 64KB, 256KB).
- **chunkIndex** (optional): If provided, only that chunk is sent; if omitted, the module automatically does **native chunking**.

#### Native Chunking

Let the **native** code handle reading and splitting your file. Omit `chunkIndex`:

```js
await FastMqttFileTransfer.sendFile(
  filePath,
  'base64',
  'my/topic',
  64_000,       // chunkSize in bytes
  undefined,    // no chunkIndex => native chunking
);
```

#### JS Chunking

Split the file in JavaScript. For each chunk, pass the chunkIndex:

```js
const totalChunks = Math.ceil(fileSize / chunkSizeInBytes);
for (let i = 0; i < totalChunks; i++) {
  await FastMqttFileTransfer.sendFile(
    filePath,
    'base64',
    'my/topic',
    chunkSizeInBytes,
    i
  );
}
```
Your app fully controls the iteration logic.

### Publish a Test Message

```js
await FastMqttFileTransfer.publishTestMessage('my/test');
```
Sends a small message (`"Hello from Kotlin!"` on Android or `"Hello from Swift!"` on iOS) to quickly confirm connectivity.

---

### Listening for Events

Two main events:
1. **`onMqttStateChanged`**:
    - `{ connected: boolean }`
2. **`onFileTransferProgress`**:
    - `{ chunkIndex: number, totalChunks: number, percentage: number }`

Example using `expo-modules-core` `EventEmitter`:

```js
import { EventEmitter } from 'expo-modules-core';
import FastMqttFileTransfer from 'fast-mqtt-filetransfer';

useEffect(() => {
  const emitter = new EventEmitter(FastMqttFileTransfer);

  // Connection changes
  const connSub = emitter.addListener('onMqttStateChanged', (event) => {
    console.log('MQTT is now', event.connected ? 'connected' : 'disconnected');
  });

  // Transfer progress
  const progressSub = emitter.addListener('onFileTransferProgress', (progress) => {
    console.log(
      `Sending chunk ${progress.chunkIndex+1}/${progress.totalChunks} (${progress.percentage.toFixed(1)}%)`
    );
  });

  return () => {
    connSub.remove();
    progressSub.remove();
  };
}, []);
```

---

## API Reference

**1. `initializeMqtt(scheme: string, host: string, port: number, path?: string)`**  
Initializes the MQTT client.
- **scheme**: `'mqtt' | 'mqtts' | 'ws' | 'wss'`
- **host**: e.g. `'broker.emqx.io'`
- **port**: e.g. `1883` for tcp, `8883` for ssl, `9001` for ws, `443` for wss
- **path**: Optional string for WS subpath. If not provided for `ws|wss`, defaults to `'/mqtt'`.

**2. `sendFile(filePath: string, encoding: string, destinationTopic: string, chunkSize: number, chunkIndex?: number)`**  
Sends a file or file chunk.
- **filePath**: Local device path.
- **encoding**: `'base64' | 'utf8' | 'none'`
- **destinationTopic**: MQTT topic.
- **chunkSize**: Byte size for each chunk.
- **chunkIndex**: If provided, only that chunk is read/sent; otherwise, the module streams the file.

**3. `publishTestMessage(topic: string)`**  
Publishes a small test string to confirm connectivity.

**4. Events**
- **`onMqttStateChanged`** → `{ connected: boolean }`
- **`onFileTransferProgress`** → `{ chunkIndex: number, totalChunks: number, percentage: number }`

---

## Memory/Performance Tips

- **Reduce Chunk Size** if you see `OutOfMemoryError`.
- **Avoid Base64** if your broker and subscriber can handle raw binary (`'none'` or `'raw'` encoding).
- **Use Native Chunking** to avoid bridging large file data through JS.
- If chunking in JS, add a brief delay (`await new Promise(r => setTimeout(r, 50))`) after each chunk to let GC catch up.

---

## Contributing

1. **Fork** this repository.
2. **Create** a feature branch (`git checkout -b feature/newFeature`).
3. **Commit** your changes.
4. **Open** a pull request to discuss and merge your work.

We welcome bug reports, suggestions, and pull requests!

---

## License

**FastMqttFileTransfer** is released under the [MIT License](LICENSE). See the [LICENSE](./LICENSE) file for details.