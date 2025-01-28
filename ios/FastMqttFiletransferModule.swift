import ExpoModulesCore
import CocoaMQTT
import Foundation

public class FastMqttFiletransferModule: Module {
  private var mqttClient: CocoaMQTT?

  public override func definition() -> ModuleDefinition {
    Name("FastMqttFiletransferModule")

    // Event definitions
    Events("onMqttStateChanged", "onFileTransferProgress")

    Function("initializeMqtt") { (scheme: String, host: String, port: UInt16, path: String?) -> Bool in
      // Validate the scheme
      guard ["mqtt", "mqtts", "ws", "wss"].contains(scheme) else {
        throw FastMqttFiletransferModuleError.invalidScheme
      }

      // Construct the URL based on scheme and optional path
      let baseUrl = "\(scheme)://\(host):\(port)"
      let fullUrl = (scheme == "ws" || scheme == "wss") && path != nil ? "\(baseUrl)\(path!)" : baseUrl

      let clientID = "ExpoMqttClient-\(UUID().uuidString)"
      mqttClient = CocoaMQTT(clientID: clientID, host: host, port: port)

      // Configure WebSocket or Secure WebSocket path
      if scheme == "ws" || scheme == "wss" {
        mqttClient?.websocketPath = path ?? "/mqtt"
      }

      mqttClient?.enableSSL = (scheme == "mqtts" || scheme == "wss")
      mqttClient?.allowUntrustedCertificates = true

      mqttClient?.didConnectAck = { [weak self] _, ack in
        if ack == .accept {
          self?.sendEvent("onMqttStateChanged", ["connected": true])
        } else {
          self?.sendEvent("onMqttStateChanged", ["connected": false])
        }
      }

      mqttClient?.didDisconnect = { [weak self] _, _ in
        self?.sendEvent("onMqttStateChanged", ["connected": false])
      }

      let success = mqttClient?.connect() ?? false
      return success
    }

    AsyncFunction("sendFile") {
      (filePath: String,
       encoding: String,
       destinationTopic: String,
       chunkSize: Int?,
       chunkIndex: Int?) -> Bool in

      guard let mqttClient = mqttClient, mqttClient.connState == .connected else {
        throw FastMqttFiletransferModuleError.notConnected
      }

      // Resolve the file path
      let url = URL(fileURLWithPath: filePath)
      guard FileManager.default.fileExists(atPath: url.path) else {
        throw FastMqttFiletransferModuleError.fileNotFound
      }

      let fileData = try Data(contentsOf: url)

      // Handle native chunking or JS-defined chunking
      if let chunkSize = chunkSize, let chunkIndex = chunkIndex {
        // JS Chunking: Send a specific chunk
        let start = chunkIndex * chunkSize
        let end = min(start + chunkSize, fileData.count)
        guard start < fileData.count else {
          throw FastMqttFiletransferModuleError.invalidChunkRange
        }

        let chunkData = fileData.subdata(in: start..<end)
        try self.publishData(chunkData, encoding: encoding, topic: destinationTopic)

        return true
      } else {
        // Native Chunking: Send the entire file in chunks
        let totalChunks = Int(ceil(Double(fileData.count) / Double(chunkSize ?? fileData.count)))
        var sentChunks = 0

        for start in stride(from: 0, to: fileData.count, by: chunkSize ?? fileData.count) {
          let end = min(start + (chunkSize ?? fileData.count), fileData.count)
          let chunkData = fileData.subdata(in: start..<end)
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

    Function("publishTestMessage") { (topic: String) -> Bool in
      guard let mqttClient = mqttClient, mqttClient.connState == .connected else {
        throw FastMqttFiletransferModuleError.notConnected
      }

      mqttClient.publish(topic, withString: "Hello from Swift!")
      return true
    }
  }

  private func publishData(_ data: Data, encoding: String, topic: String) throws {
    guard let mqttClient = mqttClient else {
      throw FastMqttFiletransferModuleError.notConnected
    }

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

    mqttClient.publish(topic, withString: payload)
  }
}

// Define Errors
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
