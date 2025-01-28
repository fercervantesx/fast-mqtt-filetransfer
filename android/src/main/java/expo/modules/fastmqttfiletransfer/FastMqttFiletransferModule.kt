package expo.modules.fastmqttfiletransfer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.eclipse.paho.android.service.MqttAndroidClient
import org.eclipse.paho.client.mqttv3.*
import java.io.File
import java.util.*

class FastMqttFiletransferModule : Module() {

  companion object {
    const val MQTT_STATE_CHANGED_EVENT = "onMqttStateChanged"
    const val FILE_TRANSFER_PROGRESS_EVENT = "onFileTransferProgress"
  }

  private var mqttClient: MqttAndroidClient? = null
  private var isConnected = false // Change val to var to allow reassignment

  /**
   * Helper function to encode data according to 'encoding'.
   */
  private fun encodeData(data: ByteArray, encoding: String): ByteArray {
    return when (encoding.lowercase()) {
      "base64" -> android.util.Base64.encode(data, android.util.Base64.NO_WRAP)
      "utf8" -> {
        val text = String(data, Charsets.UTF_8)
        text.toByteArray(Charsets.UTF_8)
      }
      else -> data
    }
  }

  /**
   * Helper function to publish a chunk via MQTT.
   */
  private fun publishChunk(payload: ByteArray, client: MqttAndroidClient, topic: String) {
    val message = MqttMessage(payload).apply {
      qos = 1
      isRetained = false
    }
    client.publish(topic, message, null, object : IMqttActionListener {
      override fun onSuccess(asyncActionToken: IMqttToken?) {
        Log.d("FastMqttFiletransferModule", "Chunk published successfully.")
      }

      override fun onFailure(asyncActionToken: IMqttToken?, exception: Throwable?) {
        Log.e("FastMqttFiletransferModule", "Failed to publish chunk: ${exception?.message}")
      }
    })
  }

  /**
   * Helper function to send the MQTT connection state.
   */
  private fun sendMQTTStateEvent(connected: Boolean) {
    sendEvent(
      MQTT_STATE_CHANGED_EVENT,
      mapOf("connected" to connected)
    )
  }

  /**
   * Helper function to send the file transfer progress.
   */
  private fun sendFileTransferProgressEvent(chunkIndex: Int, totalChunks: Long) {
    val percent = ((chunkIndex + 1) * 100) / totalChunks.toDouble()
    sendEvent(
      FILE_TRANSFER_PROGRESS_EVENT,
      mapOf(
        "chunkIndex" to chunkIndex,
        "totalChunks" to totalChunks,
        "percentage" to percent
      )
    )
  }

  override fun definition() = ModuleDefinition {
    Name("FastMqttFiletransferModule")

    Events(MQTT_STATE_CHANGED_EVENT, FILE_TRANSFER_PROGRESS_EVENT)

    Function("initializeMqtt") { scheme: String, host: String, port: Int, path: String? ->
      // Validate scheme
      if (scheme !in listOf("mqtt", "mqtts", "ws", "wss")) {
        throw IllegalArgumentException("Invalid scheme: $scheme. Use 'mqtt', 'mqtts', 'ws', or 'wss'.")
      }

      val serverUri = if (scheme == "ws" || scheme == "wss") {
        "$scheme://$host:$port${path ?: "/mqtt"}"
      } else {
        "$scheme://$host:$port"
      }

      val clientId = "ExpoMqttClient-" + UUID.randomUUID().toString()
      val context = requireNotNull(appContext.reactContext) {
        "React context is null."
      }

      mqttClient = MqttAndroidClient(context, serverUri, clientId).apply {
        setCallback(object : MqttCallbackExtended {
          override fun connectComplete(reconnect: Boolean, serverURI: String?) {
            this@FastMqttFiletransferModule.isConnected = true
            Log.d("FastMqttModule", "connectComplete, serverURI=$serverURI")
            sendMQTTStateEvent(true)
          }

          override fun connectionLost(cause: Throwable?) {
            this@FastMqttFiletransferModule.isConnected = false
            Log.e("FastMqttModule", "connectionLost: ${cause?.message}")
            sendMQTTStateEvent(false)
          }

          override fun messageArrived(topic: String, message: MqttMessage) {}
          override fun deliveryComplete(token: IMqttDeliveryToken) {}
        })
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channelId = "mqtt_channel"
        val channel = NotificationChannel(
          channelId, "MQTT Notifications", NotificationManager.IMPORTANCE_LOW
        )
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.createNotificationChannel(channel)

        val notification = Notification.Builder(context, channelId)
          .setContentTitle("MQTT Service")
          .setContentText("Running")
          .setSmallIcon(android.R.drawable.ic_menu_info_details)
          .build()

        mqttClient?.setForegroundService(notification, 1)
      }

      val options = MqttConnectOptions().apply {
        isAutomaticReconnect = true
        isCleanSession = true
      }

      try {
        mqttClient?.connect(options, null, object : IMqttActionListener {
          override fun onSuccess(asyncActionToken: IMqttToken?) {
            this@FastMqttFiletransferModule.isConnected = true
            Log.d("FastMqttModule", "Connected to MQTT broker")
            sendMQTTStateEvent(true)
          }

          override fun onFailure(asyncActionToken: IMqttToken?, exception: Throwable?) {
            this@FastMqttFiletransferModule.isConnected = false
            Log.e("FastMqttModule", "Failed to connect: ${exception?.message}")
            sendMQTTStateEvent(false)
          }
        })
      } catch (e: Exception) {
        Log.e("FastMqttModule", "initializeMqtt error: $e")
      }
      true
    }

    // 2. Send File (supports single-chunk or multi-chunk)
    AsyncFunction("sendFile") {
        filePath: String,
        encoding: String,
        destinationTopic: String,
        chunkSize: Int,
        chunkIndex: Int? ->

      // Basic checks
      if (!isConnected) {
        throw Exception("MQTT client is not connected.")
      }
      val client = mqttClient ?: throw Exception("MQTT client is not initialized.")

      // Validate file and chunk size
      val file = File(filePath)
      if (!file.exists()) {
        throw Exception("File not found at $filePath")
      }
      if (chunkSize <= 0) {
        throw IllegalArgumentException("Chunk size must be > 0")
      }

      // SINGLE-CHUNK Mode
      if (chunkIndex != null) {
        val fileSize = file.length() // Long
        val startLong = chunkIndex.toLong() * chunkSize.toLong()
        if (startLong >= fileSize) {
          throw Exception("Requested chunk is out of range.")
        }

        val endLong = minOf(startLong + chunkSize.toLong(), fileSize)
        val bytesToRead = (endLong - startLong).toInt()

        // Read just that chunk
        val data = file.inputStream().use { input ->
          input.skip(startLong)
          input.readNBytes(bytesToRead)
        }

        val payload = encodeData(data, encoding)
        publishChunk(payload, client, destinationTopic)

        true

      } else {
        // MULTI-CHUNK STREAMING Mode

        val fileSize = file.length()
        val totalChunks = (fileSize + chunkSize - 1) / chunkSize

        file.inputStream().buffered().use { inputStream ->
          val buffer = ByteArray(chunkSize)
          var bytesRead: Int
          var chunkIndex = 0

          while (inputStream.read(buffer).also { bytesRead = it } != -1) {
            val chunkData = buffer.copyOf(bytesRead)
            val payload = encodeData(chunkData, encoding)

            publishChunk(payload, client, destinationTopic)
            Log.d("FastMqttFiletransferModule", "Sent chunk $chunkIndex")

            sendFileTransferProgressEvent(chunkIndex, totalChunks)

            chunkIndex++
          }
        }
        true
      }
    }

    Function("publishTestMessage") { topic: String ->
      if (!isConnected) throw Exception("MQTT client is not connected.")
      val client = mqttClient ?: throw Exception("MQTT client is not initialized.")

      val message = MqttMessage("Hello from Kotlin!".toByteArray(Charsets.UTF_8)).apply {
        qos = 1
        isRetained = false
      }
      client.publish(topic, message)
      true
    }
  }
}