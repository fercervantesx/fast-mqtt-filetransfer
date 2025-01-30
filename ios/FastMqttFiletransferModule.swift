import ExpoModulesCore
import CocoaMQTT
import Foundation

public class FastMqttFiletransferModule: Module {
  private var mqttClient: CocoaMQTT5?
  private var socket: CocoaMQTTWebSocket?

  public func definition() -> ModuleDefinition {
    // 1. Module Name
    Name("FastMqttFiletransferModule")

    // 2. Declare events
    Events("onMqttStateChanged", "onFileTransferProgress")

    // 3. "initializeMqtt" function
    Function("initializeMqtt") { (scheme: String, host: String, port: UInt16, path: String?) -> Bool in
      // Validate scheme
      guard ["mqtt", "mqtts", "ws", "wss"].contains(scheme) else {
        throw FastMqttFiletransferModuleError.invalidScheme
      }

      let clientID = "ExpoMqttClient-\(UUID().uuidString)"

      // If using WebSockets
      if scheme == "ws" || scheme == "wss" {
        let wsURI = path ?? "/mqtt"
        let websocket = CocoaMQTTWebSocket(uri: wsURI)
        self.socket = websocket
        self.mqttClient = CocoaMQTT5(clientID: clientID, host: host, port: port, socket: websocket)
      } else {
        // Normal TCP
        self.mqttClient = CocoaMQTT5(clientID: clientID, host: host, port: port)
      }

      guard let mqttClient = self.mqttClient else {
        return false
      }

      // Enable SSL if needed
      mqttClient.enableSSL = (scheme == "mqtts" || scheme == "wss")
      mqttClient.allowUntrustCACertificate = true

      // Called when we get ConnAck from the broker
      mqttClient.didConnectAck = { [weak self] _, ack, _ in
        if ack == .success {
          self?.sendEvent("onMqttStateChanged", ["connected": true])
        } else {
          self?.sendEvent("onMqttStateChanged", ["connected": false])
        }
      }

      // Called when the client disconnects
      mqttClient.didDisconnect = { [weak self] _, _ in
        self?.sendEvent("onMqttStateChanged", ["connected": false])
      }

      // Attempt connecting
      return mqttClient.connect()
    }

    // 4. "sendFile" async function
    AsyncFunction("sendFile") {
      (filePath: String, encoding: String, destinationTopic: String, chunkSize: Int?, chunkIndex: Int?) -> Bool in

      guard let mqttClient = self.mqttClient else {
        throw FastMqttFiletransferModuleError.notConnected
      }
      guard mqttClient.connState == .connected else {
        throw FastMqttFiletransferModuleError.notConnected
      }

      // Validate file
      let url = URL(fileURLWithPath: filePath)
      guard FileManager.default.fileExists(atPath: url.path) else {
        throw FastMqttFiletransferModuleError.fileNotFound
      }
      let fileData = try Data(contentsOf: url)

      // Either single chunk or native chunk
      if let chunkSize = chunkSize, let chunkIndex = chunkIndex {
        // Single-chunk
        let start = chunkIndex * chunkSize
        let end = min(start + chunkSize, fileData.count)
        guard start < fileData.count else {
          throw FastMqttFiletransferModuleError.invalidChunkRange
        }

        let chunkData = fileData.subdata(in: start ..< end)
        try self.publishData(chunkData, encoding: encoding, topic: destinationTopic)
        return true

      } else {
        // Native chunking
        let chunk = chunkSize ?? fileData.count
        let totalChunks = Int(ceil(Double(fileData.count) / Double(chunk)))
        var sentChunks = 0

        for start in stride(from: 0, to: fileData.count, by: chunk) {
          let end = min(start + chunk, fileData.count)
          let chunkData = fileData.subdata(in: start ..< end)

          try self.publishData(chunkData, encoding: encoding, topic: destinationTopic)

          sentChunks += 1
          let percentage = (Double(sentChunks) / Double(totalChunks)) * 100
          self.sendEvent("onFileTransferProgress", [
            "chunkIndex": sentChunks - 1,
            "totalChunks": totalChunks,
            "percentage": percentage
          ])
        }
        return true
      }
    }

    // 5. A function to publish a test message
    Function("publishTestMessage") { (topic: String) -> Bool in
      guard let mqttClient = self.mqttClient, mqttClient.connState == .connected else {
        throw FastMqttFiletransferModuleError.notConnected
      }
      // Build a test CocoaMQTT5Message
      let message = CocoaMQTT5Message(topic: topic, string: "Hello from Swift!")
      let props = MqttPublishProperties()
      _ = mqttClient.publish(message, DUP: false, retained: false, properties: props)
      return true
    }
  }

  // MARK: - Helpers
  private func publishData(_ data: Data, encoding: String, topic: String) throws {
    guard let mqttClient = mqttClient else {
      throw FastMqttFiletransferModuleError.notConnected
    }

    // Determine final payload (Base64, UTF8, or fallback to raw)
    let payload: String
    switch encoding.lowercased() {
      case "base64":
        payload = data.base64EncodedString()
      case "utf8":
        guard let text = String(data: data, encoding: .utf8) else {
          throw FastMqttFiletransferModuleError.encodingFailed
        }
        payload = text
      default:
        payload = String(decoding: data, as: UTF8.self)
    }

    // Publish using CocoaMQTT5
    let message = CocoaMQTT5Message(topic: topic, string: payload)
    let props = MqttPublishProperties()
    _ = mqttClient.publish(message, DUP: false, retained: false, properties: props)
  }
}

// MARK: - Errors
enum FastMqttFiletransferModuleError: Error, CustomStringConvertible {
  case notConnected
  case fileNotFound
  case invalidChunkRange
  case encodingFailed
  case invalidScheme

  var description: String {
    switch self {
    case .notConnected:
      return "MQTT client is not connected."
    case .fileNotFound:
      return "File not found at the given path."
    case .invalidChunkRange:
      return "The requested chunk is out of range."
    case .encodingFailed:
      return "Failed to apply the requested encoding."
    case .invalidScheme:
      return "Invalid scheme. Supported schemes are 'mqtt', 'mqtts', 'ws', 'wss'."
    }
  }
}
