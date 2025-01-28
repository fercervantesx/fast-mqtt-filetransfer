import { NativeModule, requireNativeModule } from "expo";

import {
  FastMqttFiletransferModuleEvents,
  MqttModuleType,
} from "./FastMqttFiletransfer.types";

declare class FastMqttFiletransferModule
  extends NativeModule<FastMqttFiletransferModuleEvents>
  implements MqttModuleType
{
  initializeMqtt(scheme: string, host: string, port: number, path?: string): Promise<boolean>;
  sendFile(
    filePath: string,
    encoding: string,
    destinationTopic: string,
    chunkSize?: number,
    chunkIndex?: number,
  ): Promise<boolean>;
  publishTestMessage(topic: string): Promise<boolean>;
  getConnectionStatus(): boolean;
}

const FastMqttFiletransfer = requireNativeModule<FastMqttFiletransferModule>(
  "FastMqttFiletransferModule",
);

export default FastMqttFiletransfer;
