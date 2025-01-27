import { NativeModule, requireNativeModule } from 'expo';

import { FastMqttFiletransferModuleEvents } from './FastMqttFiletransfer.types';

declare class FastMqttFiletransferModule extends NativeModule<FastMqttFiletransferModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<FastMqttFiletransferModule>('FastMqttFiletransfer');
