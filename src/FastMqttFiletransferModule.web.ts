import { registerWebModule, NativeModule } from 'expo';

import { FastMqttFiletransferModuleEvents } from './FastMqttFiletransfer.types';

class FastMqttFiletransferModule extends NativeModule<FastMqttFiletransferModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(FastMqttFiletransferModule);
