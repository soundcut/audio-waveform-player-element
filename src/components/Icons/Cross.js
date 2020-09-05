import { svg } from 'uhtml';

export function Cross() {
  return svg`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#f4ffdc"
      stroke-width="2"
      stroke-linecap="square"
      stroke-linejoin="arcs"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  `;
}
