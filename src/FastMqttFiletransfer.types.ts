export enum EncodingType {
  BASE64 = 'base64',
  UTF8 = 'utf8',
}

type MqttModuleType = {
  initializeMqtt(
    scheme: string,
    host: string,
    port: number,
    path?: string,
  ): Promise<boolean>;
  sendFile(
    filePath: string,
    encoding: string,
    destinationTopic: string,
    chunkSize?: number,
    chunkIndex?: number,
  ): Promise<boolean>;
  publishTestMessage(topic: string): Promise<boolean>;
  getConnectionStatus(): boolean;
};

type MqttConnectionStatusChangeEvent = {
  connected: boolean;
};

type FileTransferProgressEvent = {
  chunkIndex: number,
  totalChunks: number,
  percentage: number,
};

type FastMqttFiletransferModuleEvents = {
  onMqttStateChanged(event: MqttConnectionStatusChangeEvent): void;
  onFileTransferProgress(event: FileTransferProgressEvent): void;
};

export { MqttModuleType, MqttConnectionStatusChangeEvent, FastMqttFiletransferModuleEvents};
