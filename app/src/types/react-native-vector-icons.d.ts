declare module 'react-native-vector-icons/MaterialIcons' {
  import React from 'react';
  import {TextStyle} from 'react-native';

  export interface IconProps {
    name: string;
    size?: number;
    color?: string;
    style?: TextStyle;
  }

  const MaterialIcons: React.ComponentType<IconProps>;
  export default MaterialIcons;
}
