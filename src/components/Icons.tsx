import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface IconProps { size?: number; color: string }

export const HomeIcon = ({ size = 26, color }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      fill={color}
      fillRule="evenodd"
      clipRule="evenodd"
      d="M2.5192 7.82274C2 8.77128 2 9.91549 2 12.2039V13.725C2 17.6258 2 19.5763 3.17157 20.7881C4.34315 22 6.22876 22 10 22H14C17.7712 22 19.6569 22 20.8284 20.7881C22 19.5763 22 17.6258 22 13.725V12.2039C22 9.91549 22 8.77128 21.4808 7.82274C20.9616 6.87421 20.0131 6.28551 18.116 5.10812L16.116 3.86687C14.1106 2.62229 13.1079 2 12 2C10.8921 2 9.88939 2.62229 7.88403 3.86687L5.88403 5.10813C3.98695 6.28551 3.0384 6.87421 2.5192 7.82274ZM9 17.25C8.58579 17.25 8.25 17.5858 8.25 18C8.25 18.4142 8.58579 18.75 9 18.75H15C15.4142 18.75 15.75 18.4142 15.75 18C15.75 17.5858 15.4142 17.25 15 17.25H9Z"
    />
  </Svg>
);

export const SearchIcon = ({ size = 26, color }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      fill={color}
      d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14"
    />
  </Svg>
);

/** Chat bubble with a smile. The smile is cut out with the bar color so the icon follows the tab color. */
export const ChatIcon = ({ size = 26, color, cut = '#0A0A0A' }: IconProps & { cut?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 512 512">
    <Path fill={color} d="M140 22H372C448 22 512 82 512 160V285C512 362 448 422 372 422H150C138 422 126 427 116 435L52 484C30 500 0 490 0 462V150C0 80 62 22 140 22Z" />
    <Path d="M178 204Q258 300 338 204" stroke={cut} strokeWidth={36} strokeLinecap="round" fill="none" />
  </Svg>
);


/** Three cards in a row (one big, two smaller). Used for the AI brain row. */
export const CardsIcon = ({ size = 24, color }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 512 512">
    <Path fill={color} d="M38 0H239Q277 0 277 38V474Q277 512 239 512H38Q0 512 0 474V38Q0 0 38 0Z" />
    <Path fill={color} d="M325 74Q325 58 340 62L378 78Q397 86 397 106V406Q397 426 378 434L340 450Q325 456 325 440Z" />
    <Path fill={color} d="M444 131Q444 115 459 119L497 135Q512 143 512 163V349Q512 369 497 377L459 393Q444 399 444 383Z" />
  </Svg>
);
