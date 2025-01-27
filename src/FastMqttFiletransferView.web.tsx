import * as React from 'react';

import { FastMqttFiletransferViewProps } from './FastMqttFiletransfer.types';

export default function FastMqttFiletransferView(props: FastMqttFiletransferViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
