import { requireNativeView } from 'expo';
import * as React from 'react';

import { FastMqttFiletransferViewProps } from './FastMqttFiletransfer.types';

const NativeView: React.ComponentType<FastMqttFiletransferViewProps> =
  requireNativeView('FastMqttFiletransfer');

export default function FastMqttFiletransferView(props: FastMqttFiletransferViewProps) {
  return <NativeView {...props} />;
}
